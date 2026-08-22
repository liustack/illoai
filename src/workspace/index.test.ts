import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadFallbackStyle, loadStyle } from '../styles/loader.ts';
import { WORKSPACE_GITIGNORE } from './ignore.ts';
import {
    appendHistory,
    createWorkspace,
    findWorkspace,
    listHistory,
    loadStylePack,
} from './index.ts';

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

describe('project workspace', () => {
    it('creates a self-contained .illoai directory and leaves project gitignore files untouched', () => {
        const cwd = tempDir('illoai-new-');
        mkdirSync(join(cwd, '.git', 'info'), { recursive: true });
        const gitignore = join(cwd, '.gitignore');
        const exclude = join(cwd, '.git', 'info', 'exclude');
        writeFileSync(gitignore, 'node_modules/\n', 'utf8');
        writeFileSync(exclude, '# local\n', 'utf8');

        const created = createWorkspace(cwd, { name: 'demo', styleName: 'minimal_watercolor' });
        const style = loadStyle('minimal_watercolor');

        expect(created.path).toBe(join(cwd, '.illoai'));
        expect(created.pack.style).toBe('minimal_watercolor');
        expect(created.pack.palette).toEqual(
            Object.fromEntries(style.paletteSlots.map((slot) => [slot.name, slot.defaultValue])),
        );
        expect(existsSync(join(created.path, 'refs'))).toBe(true);
        expect(existsSync(join(created.path, 'out'))).toBe(true);
        expect(existsSync(join(created.path, 'cache'))).toBe(true);
        expect(existsSync(join(created.path, 'history'))).toBe(false);
        expect(existsSync(join(created.path, 'project.json'))).toBe(true);
        expect(existsSync(join(created.path, 'style.json'))).toBe(false);
        expect(existsSync(join(created.path, 'history.jsonl'))).toBe(false);
        expect(readFileSync(join(created.path, '.gitignore'), 'utf8')).toBe(WORKSPACE_GITIGNORE);
        expect(readFileSync(gitignore, 'utf8')).toBe('node_modules/\n');
        expect(readFileSync(exclude, 'utf8')).toBe('# local\n');
        expect(loadStylePack(created.path).name).toBe('demo');
        expect(listHistory(created.path)).toEqual([]);
    });

    it('selects the catalog fallback style when new does not name one', () => {
        const cwd = tempDir('illoai-fallback-');
        const created = createWorkspace(cwd, { name: 'safe' });
        expect(created.pack.style).toBe(loadFallbackStyle().name);
        expect(created.pack.style).toBe('memory_color_blocks');
    });

    it('finds a parent workspace and refuses to create a second one', () => {
        const root = tempDir('illoai-walk-');
        createWorkspace(root, { name: 'root' });
        const nested = join(root, 'src', 'article');
        mkdirSync(nested, { recursive: true });

        expect(findWorkspace(nested)).toBe(join(root, '.illoai'));
        expect(() => createWorkspace(nested, { name: 'nested' })).toThrowError(
            `An IlloAI workspace already exists at ${join(root, '.illoai')}.`,
        );
        expect(existsSync(join(nested, '.illoai'))).toBe(false);
    });

    it('does not create a workspace when none exists', () => {
        const cwd = tempDir('illoai-missing-');
        expect(findWorkspace(cwd)).toBeUndefined();
        expect(existsSync(join(cwd, '.illoai'))).toBe(false);
    });

    it('fails at the project.json boundary instead of repairing it', () => {
        const cwd = tempDir('illoai-pack-');
        const workspaceDir = createWorkspace(cwd, { name: 'demo' }).path;
        writeFileSync(join(workspaceDir, 'project.json'), '{not-json', 'utf8');
        expect(() => loadStylePack(workspaceDir)).toThrowError(
            `${join(workspaceDir, 'project.json')} is not valid JSON.`,
        );

        writeFileSync(
            join(workspaceDir, 'project.json'),
            `${JSON.stringify({
                name: 'demo',
                style: 'memory_color_blocks',
                palette: { unknown: '#fff' },
                composition: { strategy: 'paper-border', guidance: 'x' },
            })}\n`,
            'utf8',
        );
        expect(() => loadStylePack(workspaceDir)).toThrowError(
            `${join(workspaceDir, 'project.json')} contains unknown palette slot "unknown".`,
        );
    });

    it('appends a history.jsonl line for each generation', () => {
        const cwd = tempDir('illoai-history-');
        const workspaceDir = createWorkspace(cwd, { name: 'demo' }).path;
        const first = {
            createdAt: '2026-08-23T00:00:00.000Z',
            style: 'memory_color_blocks',
            palette: { paper: '纯白' },
            text: 'One visual family',
            output: join(workspaceDir, 'out', 'illoai.png'),
        };
        const second = {
            ...first,
            createdAt: '2026-08-23T00:00:01.000Z',
            text: 'Second card',
        };

        appendHistory(workspaceDir, first);
        appendHistory(workspaceDir, second);
        const stored = join('out', 'illoai.png');
        expect(listHistory(workspaceDir)).toEqual([
            { ...first, output: stored },
            { ...second, output: stored },
        ]);
        expect(
            readFileSync(join(workspaceDir, 'history.jsonl'), 'utf8').trimEnd().split('\n'),
        ).toHaveLength(2);
    });
});

describe('history paths', () => {
    it('stores the output path relative to the workspace, not absolute', () => {
        const cwd = tempDir('illoai-history-relative-');
        const created = createWorkspace(cwd, { name: 'demo', styleName: 'minimal_watercolor' });
        appendHistory(created.path, {
            createdAt: '2026-08-23T00:00:00.000Z',
            style: 'minimal_watercolor',
            palette: {},
            text: '碎玻璃上的反光',
            output: join(created.path, 'out', 'a.png'),
        });
        const raw = readFileSync(join(created.path, 'history.jsonl'), 'utf8').trim();
        expect(JSON.parse(raw).output).toBe(join('out', 'a.png'));
        expect(raw).not.toContain(cwd);
    });
});
