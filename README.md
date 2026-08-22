# IlloAI

**One story. One visual language.**

IlloAI is a local-first image pipeline for people creating articles, presentations, products, and campaigns with AI. It treats the whole body of work as the unit of style, so the cover, body illustrations, social variants, and transition graphics feel like one system instead of a folder of unrelated images.

[简体中文](README.zh-CN.md)

## Why IlloAI

Generating one good image is no longer the hard part. Keeping twelve images from drifting into twelve different visual languages is.

IlloAI is built around project-level visual memory. One style, one palette, and one composition policy carry across every image position and aspect ratio. The first working source is deterministic HTML rendering, ideal when text is the information subject or will be edited repeatedly.

## What works today

- Local HTML to PNG rendering with Playwright Chromium
- An original built-in text-led template
- Explicit `--width`, `--height`, and `--scale` controls
- Four production presets: `16:9`, `5:2`, `3:2`, and `3:4`
- Ten self-contained catalog styles, listed with `illoai styles`
- A project workspace at `.illoai/` for style, palette, output, and history
- Layered config with private 0600 storage and redacted display
- Offline diagnostics for Node.js, Chromium, and config permissions
- Agent skill and DeepSeek Harness distribution skeletons

`stock` and `local-model` are registered command surfaces. They return clear not-implemented errors until those domains land.

## Quick start

```bash
pnpm install
pnpm exec playwright install chromium
pnpm build
node dist/main.js styles
node dist/main.js new demo --style memory_color_blocks
node dist/main.js gen "Every image should feel like it belongs to the same story"
```

With a workspace, PNG files land in `.illoai/out/`. Without one, the default output is `illoai.png`. Render content stays on the machine.

Choose a production size or override it directly:

```bash
node dist/main.js gen "A repeatable launch card" --preset 5:2 --output launch.png
node dist/main.js gen "A custom canvas" --width 1200 --height 630 --scale 2 --output card.png
```

## Size system

| Preset | Pixels | Primary use |
| :-- | :-- | :-- |
| `16:9` | 1600×900 | Article cover |
| `5:2` | 1600×640 | X cover, WeChat cover, section break |
| `3:2` | 1536×1024 | Article illustration with no crop |
| `3:4` | 1242×1656 | Vertical social cover |

## Layered configuration

Settings resolve in this order: command flags, `~/.illoai/config.json`, built-in defaults.

```bash
illoai config init
illoai config set render.preset 3:2
illoai config set render.scale 2
illoai config show
```

`config init` and every later write keep the file at mode 0600. `config show` masks secret values and URL credentials. Malformed config stops at the file boundary instead of being replaced by hidden defaults.

## Local diagnosis

```bash
illoai doctor
```

Doctor performs no network calls. It checks the active Node.js version, the local Playwright Chromium executable, and config file permissions.

## The style contract

Every style is one self-contained record containing its name, suitable scenarios, full prompt, avoid list, palette slots, canvas strategy, and catalog metadata. Model prompts follow one rule: copy the selected style prompt in full, unchanged, then append the subject description.

There is no global prompt assembler. Style, palette, and discipline fragments affect different media in incompatible ways, so each style owns its full language even when that means repetition.

A project workspace lives at `.illoai/`. `project.json` is the visual system and `history.jsonl` is the generation log. Both are project assets. `.illoai/.gitignore` keeps `out/`, `cache/`, and `refs/` out of git. IlloAI does not edit the project's `.gitignore` or `.git/info/exclude`.

## Privacy

| Source | Data handling |
| :-- | :-- |
| `render` | Fully local |
| `stock` | Planned. Only search keywords leave the machine |
| `local-model` | Planned. Uses the user's own local CLI and subscription |

## Development

```bash
pnpm check
pnpm build
```

Tests are colocated with source modules. The build emits the `illoai` CLI at `dist/main.js`.

## License

MIT
