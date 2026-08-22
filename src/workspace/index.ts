import {
    appendFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { loadFallbackStyle, loadStyle } from '../styles/loader.ts';
import type { CanvasStrategy } from '../styles/schema.ts';
import { writeWorkspaceIgnoreFile } from './ignore.ts';

export const WORKSPACE_DIRNAME = '.illoai';
export const PROJECT_PACK_FILE = 'project.json';
export const HISTORY_FILE = 'history.jsonl';

export interface StylePack {
    name: string;
    style: string;
    palette: Record<string, string>;
    composition: {
        strategy: CanvasStrategy;
        guidance: string;
    };
}

export interface HistoryRecord {
    createdAt: string;
    style: string;
    palette: Record<string, string>;
    text: string;
    output: string;
}

export interface CreateWorkspaceOptions {
    name: string;
    styleName?: string;
}

export interface CreatedWorkspace {
    path: string;
    pack: StylePack;
}

const STYLE_PACK_KEYS = new Set(['name', 'style', 'palette', 'composition']);
const COMPOSITION_KEYS = new Set(['strategy', 'guidance']);
const CANVAS_STRATEGIES = new Set<CanvasStrategy>(['paper-border', 'full-bleed']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidPack(packPath: string, key: string, expectation: string): never {
    throw new Error(`${packPath} has invalid "${key}". Expected ${expectation}.`);
}

export function workspacePath(cwd: string): string {
    return join(resolve(cwd), WORKSPACE_DIRNAME);
}

export function findWorkspace(startDir: string): string | undefined {
    let directory = resolve(startDir);
    while (true) {
        const candidate = join(directory, WORKSPACE_DIRNAME);
        try {
            if (statSync(candidate).isDirectory()) {
                return candidate;
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw new Error(
                    `Cannot inspect ${candidate}: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }

        const parent = dirname(directory);
        if (parent === directory) {
            return undefined;
        }
        directory = parent;
    }
}

export function loadStylePack(workspaceDir: string): StylePack {
    const packPath = join(workspaceDir, PROJECT_PACK_FILE);
    let raw: string;
    try {
        raw = readFileSync(packPath, 'utf8');
    } catch (error) {
        throw new Error(
            `Cannot read ${packPath}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error(`${packPath} is not valid JSON.`);
    }

    if (!isPlainObject(parsed)) {
        throw new Error(`${packPath} must contain a JSON object.`);
    }

    for (const key of Object.keys(parsed)) {
        if (!STYLE_PACK_KEYS.has(key)) {
            throw new Error(`${packPath} contains unknown key "${key}".`);
        }
    }

    if (typeof parsed.name !== 'string' || parsed.name.trim() === '') {
        invalidPack(packPath, 'name', 'a non-empty string');
    }
    if (typeof parsed.style !== 'string' || parsed.style.trim() === '') {
        invalidPack(packPath, 'style', 'a catalog style name');
    }

    const style = loadStyle(parsed.style);

    if (!isPlainObject(parsed.palette)) {
        invalidPack(packPath, 'palette', 'an object');
    }
    const slotNames = new Set(style.paletteSlots.map((slot) => slot.name));
    const palette: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.palette)) {
        if (!slotNames.has(key)) {
            throw new Error(`${packPath} contains unknown palette slot "${key}".`);
        }
        if (typeof value !== 'string') {
            invalidPack(packPath, `palette.${key}`, 'a string');
        }
        palette[key] = value;
    }

    if (!isPlainObject(parsed.composition)) {
        invalidPack(packPath, 'composition', 'an object');
    }
    for (const key of Object.keys(parsed.composition)) {
        if (!COMPOSITION_KEYS.has(key)) {
            throw new Error(`${packPath} contains unknown key "composition.${key}".`);
        }
    }
    if (
        typeof parsed.composition.strategy !== 'string' ||
        !CANVAS_STRATEGIES.has(parsed.composition.strategy as CanvasStrategy)
    ) {
        invalidPack(packPath, 'composition.strategy', 'paper-border or full-bleed');
    }
    if (
        typeof parsed.composition.guidance !== 'string' ||
        parsed.composition.guidance.trim() === ''
    ) {
        invalidPack(packPath, 'composition.guidance', 'a non-empty string');
    }

    return {
        name: parsed.name,
        style: parsed.style,
        palette,
        composition: {
            strategy: parsed.composition.strategy as CanvasStrategy,
            guidance: parsed.composition.guidance,
        },
    };
}

function writeStylePack(workspaceDir: string, pack: StylePack): void {
    writeFileSync(join(workspaceDir, PROJECT_PACK_FILE), `${JSON.stringify(pack, null, 2)}\n`, {
        encoding: 'utf8',
    });
}

export function createWorkspace(cwd: string, options: CreateWorkspaceOptions): CreatedWorkspace {
    const name = options.name.trim();
    if (name === '') {
        throw new Error('Project name must not be empty.');
    }

    const target = workspacePath(cwd);
    if (existsSync(target)) {
        throw new Error(`An IlloAI workspace already exists at ${target}.`);
    }

    const existing = findWorkspace(cwd);
    if (existing) {
        throw new Error(`An IlloAI workspace already exists at ${existing}.`);
    }

    const style =
        options.styleName === undefined ? loadFallbackStyle() : loadStyle(options.styleName);
    const pack: StylePack = {
        name,
        style: style.name,
        palette: Object.fromEntries(
            style.paletteSlots.map((slot) => [slot.name, slot.defaultValue]),
        ),
        composition: {
            strategy: style.canvas.strategy,
            guidance: style.canvas.guidance,
        },
    };

    mkdirSync(target, { recursive: true });
    for (const directory of ['refs', 'out', 'cache']) {
        mkdirSync(join(target, directory), { recursive: true });
    }
    writeWorkspaceIgnoreFile(target);
    writeStylePack(target, pack);

    return { path: target, pack };
}

export function defaultWorkspaceOutputPath(workspaceDir: string, now = new Date()): string {
    const stamp = now.toISOString().replaceAll(':', '-');
    return join(workspaceDir, 'out', `illoai-${stamp}.png`);
}

function historyPath(workspaceDir: string): string {
    return join(workspaceDir, HISTORY_FILE);
}

function parseHistoryRecord(filePath: string, lineNumber: number, raw: string): HistoryRecord {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error(`${filePath}:${lineNumber} is not valid JSON.`);
    }
    if (!isPlainObject(parsed)) {
        throw new Error(`${filePath}:${lineNumber} must contain a JSON object.`);
    }
    for (const key of ['createdAt', 'style', 'text', 'output'] as const) {
        if (typeof parsed[key] !== 'string') {
            throw new Error(`${filePath}:${lineNumber} has invalid "${key}". Expected a string.`);
        }
    }
    if (!isPlainObject(parsed.palette)) {
        throw new Error(`${filePath}:${lineNumber} has invalid "palette". Expected an object.`);
    }
    const palette: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.palette)) {
        if (typeof value !== 'string') {
            throw new Error(
                `${filePath}:${lineNumber} has invalid "palette.${key}". Expected a string.`,
            );
        }
        palette[key] = value;
    }
    return {
        createdAt: parsed.createdAt as string,
        style: parsed.style as string,
        palette,
        text: parsed.text as string,
        output: parsed.output as string,
    };
}

export function listHistory(workspaceDir: string): HistoryRecord[] {
    const filePath = historyPath(workspaceDir);
    let raw: string;
    try {
        raw = readFileSync(filePath, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw new Error(
            `Cannot read ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    return raw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .map((line, index) => parseHistoryRecord(filePath, index + 1, line));
}

export function appendHistory(workspaceDir: string, record: HistoryRecord): string {
    const filePath = historyPath(workspaceDir);
    // history.jsonl 会进版本库，绝对路径会把本机目录结构和用户名带进仓库，换台机器也对不上。
    const stored: HistoryRecord = { ...record, output: relative(workspaceDir, record.output) };
    appendFileSync(filePath, `${JSON.stringify(stored)}\n`, { encoding: 'utf8' });
    return filePath;
}

export function mergedPalette(pack: StylePack): Record<string, string> {
    const style = loadStyle(pack.style);
    return {
        ...Object.fromEntries(style.paletteSlots.map((slot) => [slot.name, slot.defaultValue])),
        ...pack.palette,
    };
}
