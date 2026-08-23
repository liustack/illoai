---
name: illoai
description: "Create visually coherent image sets for an article, presentation, product, or campaign with IlloAI. Use this skill whenever the user asks for article illustrations, covers, social variants, editable text-led cards, or multiple graphics that must feel like one visual family. Also use it for IlloAI configuration and offline diagnostics."
compatibility: Requires Node.js 22.19 or newer. Local HTML rendering also requires Playwright Chromium.
allowed-tools: Bash
---

# IlloAI

Create a set of images that shares one visual language. Treat the article, presentation, product, or campaign as the unit of style. Do not pick a new style for each image.

## Workspace first

Run `illoai project` before generating anything.

- If a workspace exists, keep it. Do not create another one.
- If the command says no workspace was found, run `illoai new <name> --style <style>` once.
- One project locks one style. Covers, body illustrations, social crops, and transition graphics all use that style.
- Write every generated PNG to `.illoai/out/`. Do not invent extra image folders in the user project.
- Keep `.illoai/project.json` as the project visual system. Commit it.
- Keep `.illoai/history.jsonl` as the generation log. Commit it.
- Leave `out/`, `cache/`, and `refs/` untracked. Force-add only the refs the user names.
- Copy a style prompt in full. Never rewrite, shorten, or restyle the catalog text.

```bash
illoai project
illoai new <name> --style memory_color_blocks
illoai styles
illoai styles memory_color_blocks
```

`memory_color_blocks` is the fallback style when the choice is uncertain. `minimal_watercolor`, `freehand_doodle`, and `memory_color_blocks` are the long-term primary styles. `luminous_impasto` is cover-only, needs a scene with depth, and does not go into body illustrations.

## Choose the source

Use the content role, not the presence of text, to choose a source.

| Output | Source |
| :-- | :-- |
| Text is the information subject, or the wording will be edited repeatedly | `render` |
| The picture is the subject, with at most a small amount of decorative text | `local-model` |

The current release implements `render` and `local-model`. If the request needs `stock`, report that the source is not implemented yet. Do not silently substitute another source. If a requested local-model backend is missing, stop and name the CLI to install. Do not switch to render, stock, or a different CLI.

## Render a PNG

Use an installed `illoai` command when available. Otherwise run the package with npx.

```bash
illoai doctor
illoai gen "<text>" --source render --preset 16:9
```

```bash
npx --yes --package @liustack/illoai@0.1.0 illoai gen "<text>" --source render --preset 16:9 --output <path>.png
```

When a workspace exists, omit `--output` so the PNG lands in `.illoai/out/`. Use `--output` only when the user names a path.

Available presets are `16:9`, `5:2`, `3:2`, and `3:4`. Use `--width`, `--height`, and `--scale` only when the requested output needs an explicit override.

After the command finishes, verify that the PNG exists at the reported path. Tell the user that render content stayed on the machine.

## Generate with a local model

`local-model` needs a workspace. The style lives in `.illoai/project.json`. Do not create a workspace silently.

Copy the selected style prompt in full, then append one subject description (`主体：...`). Do not assemble extra style, palette, or discipline layers.

```bash
illoai gen "<subject>" --source local-model --via codex --preset 3:2
illoai gen "<subject>" --source local-model --via grok --ref /absolute/a.png
```

`--via` chooses `codex`, `grok`, or `claude`. It is only valid with `--source local-model`. `--ref` names files only. Do not glob. Do not pass a directory.

`extreme_minimal_abstraction` fills a relationship, not a subject.

After the command finishes, verify the image at the reported path. Tell the user: `Privacy: local-model used your own CLI. We did not handle the data.`

## Preserve the visual system

- Lock one style for the whole article or product.
- Keep one project palette across covers, article illustrations, social crops, and transition graphics.
- Treat every style prompt as self-contained source text.
- Copy the selected style prompt in full, unchanged, then append one subject description.
- Never assemble a prompt from global style, palette, and discipline fragments. Those layers interfere with each style in different ways.
- Review for over-completion. Reject images that finish every object, fill every gap, or turn every surface into realistic material.
- Follow the style canvas strategy. Paper styles keep a real paper border. Full-bleed color fields fill the canvas.

## Configuration

```bash
illoai config init
illoai config set render.preset 3:2
illoai config set render.scale 2
illoai config show
```

Settings resolve in this order: command flags, `~/.illoai/config.json`, built-in defaults. `config show` masks secrets and URL credentials. `illoai doctor` performs offline checks only.
