'use strict';

let cap_gen;

async function run() {
  document.getElementById('run_button').disabled = true;
  try {
    await set_progress(0);
    if (!cap_gen) {
      await load_models();
    }
    await run_generation();
  } catch (ex) {
    alert('Failed: ' + ex);
    throw ex;
  } finally {
    document.getElementById('run_button').disabled = false;
  }
}

function set_progress(performing) {
  for (let i = 0; i < 3; i++) {
    let color = i > performing ? 'white' : (i < performing ? 'lightgreen' : 'pink');

    document.querySelector('.progress-item-' + i).style.backgroundColor = color;
  }
  return new Promise(function (resolve, reject) {
    setTimeout(resolve, 10);
  })
}

class ImageCaptionGenerator {
  constructor(runner_image, runner_caption, word_data) {
    this.runner_image = runner_image;
    this.runner_caption = runner_caption;
    this.word_data = word_data;

    let image_in_views = this.runner_image.getInputViews();
    let image_out_views = this.runner_image.getOutputViews();
    this.view_image_raw_in = image_in_views[0];
    this.view_image_feature_out = image_out_views[0];

    let cap_in_views = this.runner_caption.getInputViews();
    let cap_out_views = this.runner_caption.getOutputViews();
    this.view_cap_image_feature_in = cap_in_views[0];
    this.view_cap_word_in = cap_in_views[1];
    this.view_cap_image_switch = cap_in_views[2];
    this.view_cap_word_switch = cap_in_views[3];
    this.view_cap_h_in = cap_in_views[4];
    this.view_cap_c_in = cap_in_views[5];
    this.view_cap_word_prob = cap_out_views[0];
    this.view_cap_h_out = cap_out_views[1];
    this.view_cap_c_out = cap_out_views[2];

    this.switch_off = new Float32Array(word_data.hidden_num);
    this.zero_state = this.switch_off;//share same size 0 vector
    this.switch_on = new Float32Array(word_data.hidden_num);
    this.switch_on.fill(1);

    this.beam_stack = null;
    this.beam_width = 10;
    this.max_length = 20;
  }

  async generate_caption(image_data) {
    await set_progress(1);
    console.log('Extracting feature');
    let image_feature = await this.extract_image_feature(image_data);
    await set_progress(2);
    console.log('Initializing caption model');
    return await this.generate_caption_from_image_feature(image_feature);
  }

  async generate_caption_from_image_feature(image_feature) {
    await this.set_image_feature(image_feature);

    for (let i = 0; i < this.max_length; i++) {
      let next_stack = [];
      let any_updated = false;
      for (let j = 0; j < this.beam_stack.length; j++) {
        let current_status = this.beam_stack[j];
        if (current_status[2] == this.word_data.eos_id) {
          next_stack.push(current_status);
        } else {
          await this.predict_next_word(current_status, next_stack);
          any_updated = true;
        }
      }

      // sort by likelihood desc
      next_stack.sort((a, b) => b[3] - a[3]);
      next_stack.splice(this.beam_width);

      this.beam_stack = next_stack;

      if (!any_updated) {
        break;
      }
    }


    let sentence_strs = [];
    for (let i = 0; i < this.beam_stack.length; i++) {
      let current_status = this.beam_stack[i];
      let words = current_status[1].map(word_id => this.word_data.id_to_word[word_id]);
      words.splice(-1);//remove EOS
      let sentence_str = words.join(' ');
      sentence_strs.push(sentence_str);
    }

    await set_progress(3);
    return sentence_strs;
  }

  async extract_image_feature(image_data) {
    this.view_image_raw_in.set(image_data);
    await this.runner_image.run();
    return this.view_image_feature_out.toActual();
  }

  async set_image_feature(image_feature) {
    this.view_cap_image_feature_in.set(image_feature);
    this.view_cap_word_in.set(new Float32Array([0]));
    this.view_cap_image_switch.set(this.switch_on);
    this.view_cap_word_switch.set(this.switch_off);
    this.view_cap_h_in.set(this.zero_state);
    this.view_cap_c_in.set(this.zero_state);

    await this.runner_caption.run();

    // lstm_states, sentence, last_word, likelihood
    this.beam_stack = [[{ h: this.view_cap_h_out.toActual().slice(), c: this.view_cap_c_out.toActual().slice() },
    [], this.word_data.bos_id, 0.0]];

    this.view_cap_image_switch.set(this.switch_off);
    this.view_cap_word_switch.set(this.switch_on);
  }

  async predict_next_word(current_status, next_stack) {
    this.view_cap_word_in.set(new Float32Array([current_status[2]]));
    this.view_cap_h_in.set(current_status[0].h);
    this.view_cap_c_in.set(current_status[0].c);

    await this.runner_caption.run();

    let h_array = this.view_cap_h_out.toActual().slice();
    let c_array = this.view_cap_c_out.toActual().slice();

    let word_probs = this.view_cap_word_prob.toActual();
    let top_words = WebDNN.Math.argmax(word_probs, this.beam_width);

    for (let i = 0; i < top_words.length; i++) {
      let selected_word = top_words[i];
      let new_sentence = current_status[1].concat(selected_word);
      let new_likelihood = current_status[3] + Math.log(word_probs[selected_word]);
      next_stack.push([{ h: h_array, c: c_array }, new_sentence, selected_word, new_likelihood]);
    }

  }
}


async function run_generation() {
  console.log('start running');
  let image_data = await WebDNN.Image.getImageArray(document.getElementById('image'), {
    order: WebDNN.Image.Order.CHW,
    color: WebDNN.Image.Color.BGR,
    bias: [123.68, 116.779, 103.939]
  });
  let sentences = await cap_gen.generate_caption(image_data);
  document.getElementById('sentences').textContent = sentences.join('\n');
}

async function load_models() {
  let word_data = await (await fetch('./image-caption-model/word_data.json')).json();
  let runner_image = await WebDNN.load('./image-caption-model/image-feature', { backendOrder: ["webgpu", "webassembly"] });
  let runner_caption = await WebDNN.load('./image-caption-model/caption-generation', { backendOrder: ["webassembly"] });
  cap_gen = new ImageCaptionGenerator(runner_image, runner_caption, word_data);
}


// based on http://phiary.me/html5-canvas-drag-and-drop-image-draw/
window.onload = function () {
  // allow drag-and-drop image file on canvas
  var canvas = document.getElementById('image');
  var ctx = canvas.getContext('2d');
  var render = function (image) {
    ctx.drawImage(image, 0, 0, 224, 224);
  };

  var cancelEvent = function (e) {
    e.preventDefault();
    e.stopPropagation();
    return false;
  };

  document.addEventListener("dragover", cancelEvent, false);
  document.addEventListener("dragenter", cancelEvent, false);
  document.addEventListener("drop", function (e) {
    e.preventDefault();

    var file = e.dataTransfer.files[0];
    var image = new Image();
    image.onload = function () {
      render(this);
    };

    var reader = new FileReader();
    reader.onload = function (e) {
      image.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }, false);

  // show initial sample image
  var sample_image = new Image();
  sample_image.onload = function () {
    ctx.drawImage(sample_image, 0, 0, 224, 224);
  };

  sample_image.src = './asakusa.jpg';

  let load_local_image_element = document.getElementById("load_local_image");
  load_local_image_element.addEventListener("change", function (e) {
    let file = this.files[0];
    if (file) {
      let image_blob = window.URL.createObjectURL(file);
      sample_image.src = image_blob;
    }
  })
};

// for debugging purpose
let sample_data;
async function run_sample_data() {
  console.log('start running');
  sample_data = await (await fetch('./image-caption-model/example_io.json')).json();
  console.log('loaded sample');
  let switch_off = new Float32Array(cap_gen.word_data.hidden_num);
  let switch_on = new Float32Array(cap_gen.word_data.hidden_num);
  switch_on.fill(1.0);

  let in_views = cap_gen.runner_caption.getInputViews();
  let out_views = cap_gen.runner_caption.getOutputViews();
  let img_feat = new Float32Array(sample_data.input_img_embedded);
  in_views[0].set(img_feat);//var_input_img
  in_views[1].set(new Float32Array(1)); //var_input_word
  in_views[2].set(switch_on);//var_switch_img
  in_views[3].set(switch_off);//var_switch_word
  in_views[4].set(new Float32Array(cap_gen.word_data.hidden_num));//var_last_h
  in_views[5].set(new Float32Array(cap_gen.word_data.hidden_num));//var_last_c

  await cap_gen.runner_caption.run();

  console.log('var_word_prob_biased', out_views[0].toActual());
  console.log('var_lstm_h', new Float32Array(out_views[1].toActual()));
  console.log('expected_var_lstm_h', new Float32Array(sample_data.image_lstm_output));
  console.log('var_lstm_c', new Float32Array(out_views[2].toActual()));

  in_views[1].set(new Float32Array(sample_data.bos_raw_vec));
  in_views[2].set(switch_off);
  in_views[3].set(switch_on);
  in_views[4].set(out_views[1].toActual());
  in_views[5].set(out_views[2].toActual());

  await cap_gen.runner_caption.run();

  console.log('var_word_prob_biased', out_views[0].toActual());
  console.log('expected_var_word_prob_biased', new Float32Array(sample_data.bos_word_prob));
  console.log('var_lstm_h', new Float32Array(out_views[1].toActual()));
  console.log('expected_var_lstm_h', new Float32Array(sample_data.bos_lstm_output));
  console.log('var_lstm_c', new Float32Array(out_views[2].toActual()));
}

async function run_generation_sample_data() {
  console.log('start running');
  sample_data = await (await fetch('./image-caption-model/example_io.json')).json();
  console.log('loaded sample');
  let sentences = await cap_gen.generate_caption_from_image_feature(new Float32Array(sample_data.input_img_embedded));
  document.getElementById('sentences').textContent = sentences.join('\n');
}
