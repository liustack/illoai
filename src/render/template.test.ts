import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { createRenderTemplate, DEFAULT_RENDER_COLORS } from './template.ts';

describe('built-in render template', () => {
    it('treats the requested copy as text instead of executable HTML', () => {
        const html = createRenderTemplate('<script>globalThis.pwned = true</script> & clarity');

        expect(html).toContain(
            '&lt;script&gt;globalThis.pwned = true&lt;/script&gt; &amp; clarity',
        );
        expect(html).not.toContain('<script>globalThis.pwned = true</script>');
        expect(html).toContain('<main id="canvas">');
        expect(html).toContain('IlloAI');
        expect(html).toContain(`--illo-paper: ${DEFAULT_RENDER_COLORS.paper}`);
        expect(html).toContain(`--illo-accent: ${DEFAULT_RENDER_COLORS.accent}`);
    });

    it('applies CSS palette values and still embeds descriptive slot text', () => {
        const withHex = createRenderTemplate('Accent override', {
            palette: { accent: '#ff4d00', paper: '暖白' },
        });
        expect(withHex).toContain('--illo-accent: #ff4d00');
        expect(withHex).toContain(`--illo-paper: ${DEFAULT_RENDER_COLORS.paper}`);
        expect(withHex).toContain('暖白');

        const descriptive = createRenderTemplate('Descriptive palette', {
            palette: { paper: '纯白', accent: '雾蓝加陶土色' },
        });
        expect(descriptive).toContain(`--illo-paper: ${DEFAULT_RENDER_COLORS.paper}`);
        expect(descriptive).toContain(`--illo-accent: ${DEFAULT_RENDER_COLORS.accent}`);
        expect(descriptive).toContain('纯白');
        expect(descriptive).toContain('雾蓝加陶土色');
    });

    it('keeps paragraph copy above the footer on the shallow 5:2 canvas', async () => {
        const paragraphs = [
            '同一个项目里的封面、正文插图、社交平台变体和章节过渡图，应当共享同一套配色、字体与构图纪律。修改一个词时，版面保持稳定，整篇文章的视觉体系也不会散架。',
            '同一项目保持视觉一致。'.repeat(28),
        ];
        const browser = await chromium.launch({ headless: true });

        try {
            const page = await browser.newPage({ viewport: { width: 1600, height: 640 } });
            for (const text of paragraphs) {
                await page.setContent(createRenderTemplate(text), { waitUntil: 'load' });
                const copy = await page.locator('.copy').boundingBox();
                const footer = await page.locator('footer').boundingBox();

                expect(copy).not.toBeNull();
                expect(footer).not.toBeNull();
                expect((copy?.y ?? 0) + (copy?.height ?? 0)).toBeLessThanOrEqual(footer?.y ?? 0);
            }
        } finally {
            await browser.close();
        }
    }, 30_000);
});
