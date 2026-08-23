# IlloAI

**一篇内容，一套视觉语言。**

IlloAI 是面向 AI 内容创作者的本地优先配图生产线。它把整篇文章、整套演示、整个产品或整场活动当作一个风格单元，让封面、正文插图、社交平台变体和过渡图属于同一个视觉体系，不再像临时拼成的一组散图。

[English](README.md)

## 为什么是 IlloAI

生成一张好图已经不难。真正难的是连续生成十二张图后，它们仍然像同一个视觉系统里的作品。

IlloAI 围绕项目级视觉记忆设计。一套风格、一套配色和一种构图纪律贯穿所有图位与比例。一期先落地可复现的 HTML 渲染档，适合文字是信息主体，或文案需要反复修改的封面卡片和信息图。

## 当前可用能力

- Playwright Chromium 本地 HTML 转 PNG
- 原创的内置文字卡片模板
- `--width`、`--height`、`--scale` 精确控制
- 四个生产尺寸预设：`16:9`、`5:2`、`3:2`、`3:4`
- 十式自包含风格库，可用 `illoai styles` 列出
- 项目工作区 `.illoai/`，保存选定式、配色、产物和历史
- 分层配置、0600 私密存储和脱敏展示
- 通过用户本机的 Codex、Grok 或 Claude CLI 生图
- Node.js、Chromium、配置权限与本机 CLI 的离线诊断
- Agent skill 与 DeepSeek Harness 分发骨架

`stock` 已注册命令入口，对应业务尚未实现。调用时会返回明确错误。本机 CLI 没装时会点名要装什么，不会静默换路。

## 快速开始

```bash
pnpm install
pnpm exec playwright install chromium
pnpm build
node dist/main.js styles
node dist/main.js new demo --style memory_color_blocks
node dist/main.js gen "让整篇文章的每张图都属于同一个视觉体系"
node dist/main.js gen "一只背对的人站在湖边" --source local-model --via codex --preset 3:2
```

有工作区时，PNG 写到 `.illoai/out/`。没有工作区时，默认输出为 `illoai.png`。render 档全程留在本机。`local-model` 走用户自己的 CLI，我们不经手数据。

可以选择生产尺寸，也可以直接覆盖画布参数：

```bash
node dist/main.js gen "一张可以稳定重渲染的发布卡片" --preset 5:2 --output launch.png
node dist/main.js gen "自定义画布" --width 1200 --height 630 --scale 2 --output card.png
```

## 尺寸系统

| 预设 | 像素 | 主要用途 |
| :-- | :-- | :-- |
| `16:9` | 1600×900 | 文章封面 |
| `5:2` | 1600×640 | X 封面、公众号封面、文内过渡条 |
| `3:2` | 1536×1024 | 正文插图，原生比例零裁切 |
| `3:4` | 1242×1656 | 竖版社交平台封面 |

## 分层配置

配置优先级依次为命令 flags、`~/.illoai/config.json`、内置默认值。

```bash
illoai config init
illoai config set render.preset 3:2
illoai config set render.scale 2
illoai config show
```

`config init` 与后续每次写入都会把配置文件保持为 0600。`config show` 会遮蔽密钥与 URL 凭据。配置损坏或字段类型错误时会在文件边界直接报错，不会用隐藏默认值掩盖问题。

## 本地诊断

```bash
illoai doctor
```

doctor 不发起网络请求。它检查当前 Node.js 版本、本机 Playwright Chromium 可执行文件、配置文件权限，以及 PATH 上有没有 `codex`、`grok`、`claude`。本机 CLI 没装记为警告，不会因此判成不健康。

## 风格契约

每种风格都是一条自包含记录，包括式名、适用场景、提示词全文、避免清单、配色占位槽、画布策略和目录元数据。模型提示词只遵守一条机械规则：完整照抄所选风格提示词，再接一段主体描述。

项目中不存在全局 prompt 组装器。风格层、配色层和纪律层对不同介质的影响并不相同，因此每一式独立拥有完整语言，即使存在文字冗余也不拆层。

工作区在 `.illoai/`。`project.json` 是项目视觉体系，`history.jsonl` 是出图记录，两份都进版本库。`.illoai/.gitignore` 忽略 `out/`、`cache/` 和 `refs/`。IlloAI 不会改用户仓库的 `.gitignore` 或 `.git/info/exclude`。

## 隐私

| 图源 | 数据处理方式 |
| :-- | :-- |
| `render` | 全程本地 |
| `stock` | 规划中，只发送搜索关键词 |
| `local-model` | 使用用户自己的本机 CLI 与订阅，我们不经手数据 |

## 开发

```bash
pnpm check
pnpm build
```

测试与源码模块同目录。构建产物 `dist/main.js` 提供 `illoai` 命令。

## License

MIT
