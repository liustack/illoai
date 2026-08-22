import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setConfigValue } from './config.ts';
import { createProgram, runCli } from './main.ts';
import { loadStyle } from './styles/loader.ts';

const tempDirectories: string[] = [];

afterEach(() => {
    for (const directory of tempDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

function tempDir(prefix: string): string {
    const directory = mkdtempSync(join(tmpdir(), prefix));
    tempDirectories.push(directory);
    return directory;
}

function captureOutput(): { chunks: string[]; write: (chunk: string) => void } {
    const chunks: string[] = [];
    return {
        chunks,
        write: (chunk: string) => {
            chunks.push(chunk);
        },
    };
}

function mockRender() {
    return vi.fn(async (options) => ({
        pngPath: options.outputPath,
        meta: {
            width: options.width,
            height: options.height,
            scale: options.scale,
            pixelWidth: options.width * options.scale,
            pixelHeight: options.height * options.scale,
            generatedAt: '2026-08-23T00:00:00.000Z',
        },
    }));
}

describe('IlloAI CLI', () => {
    it('registers every first-phase command', () => {
        const program = createProgram();
        expect(program.commands.map((command) => command.name())).toEqual([
            'gen',
            'new',
            'project',
            'styles',
            'config',
            'doctor',
        ]);
    });

    it('lists styles and prints a style prompt unchanged', async () => {
        const stdout = captureOutput();
        const listCode = await runCli(['node', 'illoai', 'styles'], { stdout });
        expect(listCode).toBe(0);
        const listed = stdout.chunks.join('');
        expect(listed).toContain('minimal_watercolor');
        expect(listed).toContain('memory_color_blocks');
        expect(listed).toContain('primary');
        expect(listed).toContain('fallback');
        expect(listed).toContain('luminous_impasto');
        expect(listed).toContain('cover-only');

        const detailOut = captureOutput();
        const detailCode = await runCli(['node', 'illoai', 'styles', 'memory_color_blocks'], {
            stdout: detailOut,
        });
        expect(detailCode).toBe(0);
        const detail = detailOut.chunks.join('');
        expect(detail).toContain(loadStyle('memory_color_blocks').prompt);
        expect(detail).toContain('配色是这个式子的身份');
        expect(detail).toContain('paper: 纯白 / #ffffff');
        expect(detail).toContain('accent: 暖黄点 / #e6b84d');
        expect(detail).not.toContain('defaultValue');

        const unknownOut = captureOutput();
        const unknownErr = captureOutput();
        const unknownCode = await runCli(['node', 'illoai', 'styles', 'unknown'], {
            stdout: unknownOut,
            stderr: unknownErr,
        });
        expect(unknownCode).toBe(1);
        expect(unknownErr.chunks.join('')).toContain('Unknown style "unknown"');
    });

    it('creates a workspace with new and shows it with project', async () => {
        const cwd = tempDir('illoai-cli-new-');
        mkdirSync(join(cwd, '.git', 'info'), { recursive: true });
        writeFileSync(join(cwd, '.gitignore'), 'dist/\n', 'utf8');
        writeFileSync(join(cwd, '.git', 'info', 'exclude'), 'secret\n', 'utf8');
        const stdout = captureOutput();

        const exitCode = await runCli(
            ['node', 'illoai', 'new', 'demo', '--style', 'freehand_doodle'],
            { cwd, stdout },
        );

        expect(exitCode).toBe(0);
        expect(stdout.chunks.join('')).toBe(
            [
                'Created .illoai/',
                '  project.json    your visual system, commit this',
                '  .gitignore      keeps out/, cache/, refs/ out of git',
                '  refs/ out/ cache/',
                '',
                'Nothing was written to your .gitignore or .git/info/exclude.',
                '',
            ].join('\n'),
        );
        expect(JSON.parse(readFileSync(join(cwd, '.illoai', 'project.json'), 'utf8')).style).toBe(
            'freehand_doodle',
        );
        expect(readFileSync(join(cwd, '.gitignore'), 'utf8')).toBe('dist/\n');
        expect(readFileSync(join(cwd, '.git', 'info', 'exclude'), 'utf8')).toBe('secret\n');

        const projectOut = captureOutput();
        const projectCode = await runCli(['node', 'illoai', 'project'], {
            cwd,
            stdout: projectOut,
        });
        expect(projectCode).toBe(0);
        expect(projectOut.chunks.join('')).toContain('Style: freehand_doodle');
        expect(projectOut.chunks.join('')).toContain('paper: 纯白 / #ffffff');
        expect(projectOut.chunks.join('')).toContain('fill: 雾蓝加陶土色 / #8a9aaa');
        expect(projectOut.chunks.join('')).toContain('Images: 0');
    });

    it('tells project to run new instead of creating a workspace', async () => {
        const cwd = tempDir('illoai-cli-missing-');
        const stdout = captureOutput();
        const stderr = captureOutput();
        const exitCode = await runCli(['node', 'illoai', 'project'], { cwd, stdout, stderr });

        expect(exitCode).toBe(1);
        expect(stderr.chunks.join('')).toBe(
            'Error: No IlloAI workspace found. Run illoai new <name> first.\n',
        );
        expect(stdout.chunks).toEqual([]);
        expect(readdirSync(cwd)).toEqual([]);
    });

    it('runs gen through the local renderer with CLI flags above file config', async () => {
        const directory = tempDir('illoai-cli-');
        const configPath = join(directory, 'config.json');
        const outputPath = join(directory, 'result.png');
        setConfigValue('source', 'stock', configPath);
        setConfigValue('render.preset', '5:2', configPath);
        setConfigValue('render.scale', '2', configPath);

        const renderHtml = mockRender();
        const stdout = captureOutput();
        const stderr = captureOutput();

        const exitCode = await runCli(
            [
                'node',
                'illoai',
                'gen',
                'All images belong to one visual family',
                '--source',
                'render',
                '--output',
                outputPath,
                '--width',
                '800',
            ],
            { cwd: directory, configPath, renderHtml, stdout, stderr },
        );

        expect(exitCode).toBe(0);
        expect(stderr.chunks).toEqual([]);
        expect(renderHtml).toHaveBeenCalledOnce();
        expect(renderHtml.mock.calls[0]?.[0]).toMatchObject({
            outputPath,
            width: 800,
            height: 640,
            scale: 2,
        });
        expect(renderHtml.mock.calls[0]?.[0].html).toContain(
            'All images belong to one visual family',
        );
        expect(stdout.chunks.join('')).toContain('Privacy: render stayed on this machine.');
        expect(readdirSync(directory)).not.toContain('.illoai');
    });

    it('writes workspace gen output under .illoai/out and records history', async () => {
        const cwd = tempDir('illoai-cli-ws-');
        const stdout = captureOutput();
        await runCli(['node', 'illoai', 'new', 'demo', '--style', 'minimal_watercolor'], {
            cwd,
            stdout,
        });

        const renderHtml = mockRender();
        const genOut = captureOutput();
        const now = new Date('2026-08-23T00:00:00.000Z');
        const exitCode = await runCli(
            ['node', 'illoai', 'gen', 'Workspace card', '--source', 'render'],
            {
                cwd,
                configPath: join(cwd, 'unused-config.json'),
                renderHtml,
                stdout: genOut,
                now: () => now,
            },
        );

        expect(exitCode).toBe(0);
        const outputPath = join(cwd, '.illoai', 'out', 'illoai-2026-08-23T00-00-00.000Z.png');
        expect(renderHtml.mock.calls[0]?.[0].outputPath).toBe(outputPath);
        expect(renderHtml.mock.calls[0]?.[0].html).toContain('Workspace card');
        expect(renderHtml.mock.calls[0]?.[0].html).toContain('暖白');
        expect(renderHtml.mock.calls[0]?.[0].html).toContain('#f4efe6');
        expect(renderHtml.mock.calls[0]?.[0].html).toContain('--illo-paper: #f4efe6');
        const historyLines = readFileSync(join(cwd, '.illoai', 'history.jsonl'), 'utf8')
            .trimEnd()
            .split('\n');
        expect(historyLines).toHaveLength(1);
        const history = JSON.parse(historyLines[0] ?? '{}');
        expect(history).toEqual({
            createdAt: '2026-08-23T00:00:00.000Z',
            style: 'minimal_watercolor',
            palette: {
                paper: { prompt: '暖白', css: '#f4efe6' },
                primary: { prompt: '低饱和雾蓝与灰青绿', css: '#7a93a0' },
                secondary: { prompt: '沙色、米白', css: '#d8cbb8' },
                accent: { prompt: '低饱和暖黄', css: '#d4b56a' },
                dark: { prompt: '淡墨', css: '#5c5a54' },
            },
            text: 'Workspace card',
            output: join('out', 'illoai-2026-08-23T00-00-00.000Z.png'),
        });
    });

    it('rejects unimplemented image sources without a silent fallback', async () => {
        const directory = tempDir('illoai-source-');
        const configPath = join(directory, 'config.json');
        setConfigValue('source', 'stock', configPath);
        const renderHtml = vi.fn();
        const stdout = captureOutput();
        const stderr = captureOutput();

        const exitCode = await runCli(['node', 'illoai', 'gen', 'A subject'], {
            cwd: directory,
            configPath,
            renderHtml,
            stdout,
            stderr,
        });

        expect(exitCode).toBe(1);
        expect(renderHtml).not.toHaveBeenCalled();
        expect(stderr.chunks.join('')).toBe(
            'Error: Source "stock" is not implemented yet. Use --source render.\n',
        );
    });
});
