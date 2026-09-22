import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { createPhotoCoverTemplate, preparePhotoLayer } from './photo-cover.ts';

const tempDirectories: string[] = [];

afterEach(() => {
    for (const directory of tempDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

async function writeTestPhoto(width: number, height: number): Promise<string> {
    const directory = mkdtempSync(join(tmpdir(), 'illoai-photo-'));
    tempDirectories.push(directory);
    const path = join(directory, 'photo.png');
    const bytes = await sharp({
        create: { width, height, channels: 3, background: { r: 120, g: 90, b: 60 } },
    })
        .png()
        .toBuffer();
    writeFileSync(path, bytes);
    return path;
}

describe('photo cover', () => {
    it('covers the canvas at the requested pixel size and inlines a jpeg data uri', async () => {
        const source = await writeTestPhoto(400, 800);
        const layer = await preparePhotoLayer(source, 320, 180);

        expect(layer.sourceWidth).toBe(400);
        expect(layer.sourceHeight).toBe(800);
        expect(layer.dataUri.startsWith('data:image/jpeg;base64,')).toBe(true);
        const meta = await sharp(
            Buffer.from(layer.dataUri.slice('data:image/jpeg;base64,'.length), 'base64'),
        ).metadata();
        expect([meta.width, meta.height]).toEqual([320, 180]);
    });

    it('escapes text, inlines the photo, and applies palette colors', () => {
        const html = createPhotoCoverTemplate('<Dawn> & "sea"', {
            photo: { dataUri: 'data:image/jpeg;base64,AAAA', sourceWidth: 1, sourceHeight: 1 },
            palette: {
                paper: { prompt: '暖白', css: '#f4efe6' },
                accent: { prompt: '暖色', css: '#c9895a' },
            },
        });

        expect(html).toContain('&lt;Dawn&gt; &amp; &quot;sea&quot;');
        expect(html).toContain('src="data:image/jpeg;base64,AAAA"');
        expect(html).toContain('--illo-paper: #f4efe6');
        expect(html).toContain('--illo-accent: #c9895a');
        expect(html).toContain('data-density="short"');
        expect(html).not.toContain('<script');
    });

    it('puts only the headline on the cover, with no tool name or explanatory labels', () => {
        const html = createPhotoCoverTemplate('Dawn', {
            photo: { dataUri: 'data:image/jpeg;base64,AAAA', sourceWidth: 1, sourceHeight: 1 },
        });
        const body = html.slice(html.indexOf('<body>'));

        expect(body).toContain('>Dawn</p>');
        for (const label of ['IlloAI', 'Photo cover', 'Local render', 'visual language']) {
            expect(body).not.toContain(label);
        }
    });
});
