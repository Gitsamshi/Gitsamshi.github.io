# -*- coding: utf-8 -*-

import argparse
import json
import os
import sys
import multiprocessing
import numpy as np
import scipy.io
import chainer
from chainer import Variable, serializers, cuda, functions as F
import PIL.Image

parser = argparse.ArgumentParser(description='Convert JSON dataset to pkl')
parser.add_argument('input_json', type=str,
                    help='input sentences JSON file path')
parser.add_argument('input_image', type=str,
                    help='input directory containing images (searched recursively)')
parser.add_argument('output', type=str,
                    help='output feature file path (matlab format)')
parser.add_argument('--gpu', '-g', default=-1, type=int,
                    help='GPU ID (negative value indicates CPU)')
parser.add_argument('--batchsize', '-b', default=16, type=int,
                    help='Feature extraction batch size')
args = parser.parse_args()

sys.stderr.write("Loading...\n")

with open(args.input_json) as f:
    input_dataset = json.load(f)

assert input_dataset["dataset"] == "coco", "supports coco only"

link = chainer.links.model.vision.resnet.ResNet50Layers()

xp = np
if args.gpu >= 0:
    cuda.check_cuda_available()
    gpu_device = args.gpu
    cuda.get_device_from_id(gpu_device).use()
    xp = cuda.cupy
    link.to_gpu(gpu_device)

image_file_map = {}  # basename, fullpath
for root, dirs, files in os.walk(args.input_image):
    for file in files:
        image_file_map[file] = os.path.join(root, file)

images = []
for entry in input_dataset["images"]:
    filename = entry["filename"]
    if filename not in image_file_map:
        raise Exception("File {} not found".format(filename))
    images.append(image_file_map[filename])

sys.stderr.write("Extracting...\n")


# Changes may be needed in Windows
def image_loader(q, images, batchsize):
    for i in range(0, len(images), batchsize):
        sys.stderr.write("\r{:.2f}%".format(i / len(images) * 100))
        batch_data = [PIL.Image.open(image) for image in images[i:i + args.batchsize]]
        q.put(batch_data)
    q.put([])


q = multiprocessing.Queue(maxsize=10)
p = multiprocessing.Process(target=image_loader, args=(q, images, args.batchsize))
p.start()

feats = np.zeros((2048, len(images)), dtype=np.float32)  # one image = one column
with chainer.using_config('train', False):
    with chainer.using_config('enable_backprop', False):
        ofs = 0
        while True:
            batch_data = q.get()
            if len(batch_data) == 0:
                break
            batch_feat = link.extract(batch_data, layers=["pool5"])["pool5"]
            feats[:, ofs:ofs + len(batch_feat)] = cuda.to_cpu(batch_feat.data).T
            ofs += len(batch_feat)

sys.stderr.write("\rSaving...\n")
scipy.io.savemat(args.output, {"feats": feats})

p.join()
