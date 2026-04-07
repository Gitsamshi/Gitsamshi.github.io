# gitsamshi.github.io

Personal website & blog powered by [Hugo](https://gohugo.io/) + [PaperMod](https://github.com/adityatelange/hugo-PaperMod).

## Quick Start

```bash
# 1. Clone this repo
git clone https://github.com/gitsamshi/gitsamshi.github.io.git
cd gitsamshi.github.io

# 2. Add PaperMod theme as submodule
git submodule add --depth=1 https://github.com/adityatelange/hugo-PaperMod.git themes/PaperMod

# 3. Copy your profile photo
# Put your 19702190.jpeg in the static/ folder

# 4. Local preview
hugo server -D
# Visit http://localhost:1313

# 5. Deploy — just push to main, GitHub Actions handles the rest
git add .
git commit -m "migrate to Hugo"
git push origin main
```

## After Push

Go to **Settings → Pages → Source** and select **GitHub Actions** (not "Deploy from a branch").

## Writing Posts

```bash
hugo new posts/my-new-post.md
```

Set `draft: false` in front matter when ready to publish.

## Structure

```
content/
├── about.md           # About page
├── publications.md    # Publications list
├── search.md          # Search page
└── posts/             # Blog posts
    ├── a-evolve-intro.md
    └── grpo-training-notes.md (draft)
```
