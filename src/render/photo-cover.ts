// 照片封面：图库照片做底图，项目调色板做色调层，正文大字压在下三分之一。
// 渲染引擎禁网禁 JS，照片先用 sharp 裁到画布像素尺寸再内联成 data URI。
import sharp from 'sharp';
import type { PaletteSlotValue } from '../styles/schema.ts';
import { resolveRenderColors } from './template.ts';

const PHOTO_JPEG_QUALITY = 82;

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export interface PhotoLayer {
    dataUri: string;
    sourceWidth: number;
    sourceHeight: number;
}

export async function preparePhotoLayer(
    imagePath: string,
    pixelWidth: number,
    pixelHeight: number,
): Promise<PhotoLayer> {
    const image = sharp(imagePath, { failOn: 'error' });
    const meta = await image.metadata();
    if (meta.width === undefined || meta.height === undefined) {
        throw new Error(`Cannot read image size from ${imagePath}.`);
    }
    const bytes = await image
        .rotate()
        .resize(pixelWidth, pixelHeight, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: PHOTO_JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
    return {
        dataUri: `data:image/jpeg;base64,${bytes.toString('base64')}`,
        sourceWidth: meta.width,
        sourceHeight: meta.height,
    };
}

export interface PhotoCoverOptions {
    palette?: Record<string, PaletteSlotValue>;
    photo: PhotoLayer;
}

export function createPhotoCoverTemplate(text: string, options: PhotoCoverOptions): string {
    const safeText = escapeHtml(text);
    const characterCount = Array.from(text.trim()).length;
    const density = characterCount <= 40 ? 'short' : characterCount <= 100 ? 'medium' : 'long';
    const colors = resolveRenderColors(options.palette ?? {});

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>IlloAI</title>
    <style>
        :root {
            color-scheme: light;
            font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, "Songti SC", serif;
            --illo-paper: ${colors.paper};
            --illo-ink: ${colors.ink};
            --illo-accent: ${colors.accent};
            background: var(--illo-ink);
            color: var(--illo-paper);
        }

        * {
            box-sizing: border-box;
        }

        html,
        body {
            width: 100%;
            height: 100%;
            margin: 0;
            overflow: hidden;
        }

        #canvas {
            position: relative;
            display: grid;
            grid-template-rows: auto 1fr auto;
            width: 100vw;
            height: 100vh;
            padding: 5.4vh 5.6vw 5vh;
            isolation: isolate;
        }

        .photo {
            position: absolute;
            inset: 0;
            z-index: -3;
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .wash {
            position: absolute;
            inset: 0;
            z-index: -2;
            background: var(--illo-paper);
            mix-blend-mode: multiply;
            opacity: 0.42;
        }

        .scrim {
            position: absolute;
            inset: 0;
            z-index: -1;
            background: linear-gradient(
                180deg,
                color-mix(in srgb, var(--illo-ink) 34%, transparent) 0%,
                transparent 30%,
                transparent 46%,
                color-mix(in srgb, var(--illo-ink) 86%, transparent) 100%
            );
        }

        #canvas::before {
            position: absolute;
            inset: 0 auto 0 0;
            width: 1.25vw;
            min-width: 10px;
            content: "";
            background: var(--illo-accent);
        }

        header,
        footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
            font-size: clamp(11px, 1.05vw, 18px);
            font-weight: 650;
            letter-spacing: 0.13em;
            line-height: 1;
            text-transform: uppercase;
            text-shadow: 0 1px 2px color-mix(in srgb, var(--illo-ink) 60%, transparent);
        }

        .brand {
            font-family: "Helvetica Neue", "PingFang SC", sans-serif;
            font-size: clamp(18px, 1.75vw, 30px);
            font-weight: 800;
            letter-spacing: -0.045em;
            text-transform: none;
        }

        .copy-wrap {
            display: flex;
            align-items: flex-end;
            min-height: 0;
            padding: 4vh 0 3.6vh;
        }

        .copy {
            margin: 0;
            font-weight: 600;
            letter-spacing: -0.05em;
            line-height: 0.98;
            text-wrap: balance;
            white-space: pre-wrap;
            text-shadow: 0 2px 12px color-mix(in srgb, var(--illo-ink) 55%, transparent);
        }

        .copy[data-density="short"] {
            max-width: 12em;
            font-size: clamp(44px, min(6.8vw, 15vh), 120px);
        }

        .copy[data-density="medium"] {
            max-width: 18em;
            font-size: clamp(32px, min(4vw, 10vh), 72px);
            line-height: 1;
        }

        .copy[data-density="long"] {
            max-width: 28em;
            font-size: clamp(22px, min(2.4vw, 6vh), 44px);
            line-height: 1.08;
            text-wrap: pretty;
        }

        .local {
            color: var(--illo-accent);
        }
    </style>
</head>
<body>
    <main id="canvas">
        <img class="photo" src="${options.photo.dataUri}" alt="">
        <div class="wash" aria-hidden="true"></div>
        <div class="scrim" aria-hidden="true"></div>
        <header>
            <span class="brand">IlloAI</span>
            <span>Photo cover / 001</span>
        </header>
        <section class="copy-wrap" aria-label="Rendered text">
            <p class="copy" data-density="${density}">${safeText}</p>
        </section>
        <footer>
            <span>One story · one visual language</span>
            <span class="local">Local render</span>
        </footer>
    </main>
</body>
</html>`;
}
