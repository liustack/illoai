import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_MODEL_TIMEOUT_MS, type LocalModelSpawnRequest, runLocalModel } from './index.ts';

const tempDirectories: string[] = [];
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xee]);

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

function baseInput(outputPath: string) {
    return {
        provider: 'codex' as const,
        commandPath: '/fake/codex',
        prompt: 'Use your image generation capability. 主体：海岸.',
        referencePaths: [] as string[],
        outputPath,
    };
}

describe('local-model run', () => {
    it('exports a 5-minute default timeout', () => {
        expect(LOCAL_MODEL_TIMEOUT_MS).toBe(300_000);
    });

    it('removes the target file before spawn so a stale PNG cannot count as success', async () => {
        const outputPath = join(tempDir('illoai-run-stale-'), 'stale.png');
        writeFileSync(outputPath, Buffer.concat([PNG_MAGIC, Buffer.from('stale')]));
        let goneWhenSpawned = false;
        const spawn = vi.fn(async (_request: LocalModelSpawnRequest) => {
            goneWhenSpawned = !existsSync(outputPath);
        });

        let thrown: unknown;
        try {
            await runLocalModel({
                ...baseInput(outputPath),
                spawn,
            });
        } catch (error) {
            thrown = error;
        }

        expect(spawn).toHaveBeenCalled();
        expect(goneWhenSpawned).toBe(true);
        expect(spawn.mock.calls[0]?.[0].stdin).toBe('ignore');
        expect(thrown).toBeInstanceOf(Error);
        const message = thrown instanceof Error ? thrown.message : String(thrown);
        expect(message).toMatch(/missing|not found|does not exist|invalid|empty/i);
        expect(message).toMatch(/local-model|codex/);
    });

    it('rejects missing, empty, and non-image output and accepts PNG and JPEG magic', async () => {
        const directory = tempDir('illoai-run-verify-');
        const missingPath = join(directory, 'missing.png');
        const emptyPath = join(directory, 'empty.png');
        const randomPath = join(directory, 'random.png');
        const pngPath = join(directory, 'ok.png');
        const jpegPath = join(directory, 'ok.jpg');

        const missingError = await runLocalModel({
            ...baseInput(missingPath),
            spawn: vi.fn(async (_request: LocalModelSpawnRequest) => undefined),
        }).then(
            () => undefined,
            (error: unknown) => error,
        );
        expect(missingError).toBeInstanceOf(Error);
        expect((missingError as Error).message).toMatch(/missing|not found|does not exist/i);
        expect((missingError as Error).message).toMatch(/local-model|codex/);

        const emptySpawn = vi.fn(async (_request: LocalModelSpawnRequest) => {
            writeFileSync(emptyPath, Buffer.alloc(0));
        });
        const emptyError = await runLocalModel({
            ...baseInput(emptyPath),
            spawn: emptySpawn,
        }).then(
            () => undefined,
            (error: unknown) => error,
        );
        expect(emptyError).toBeInstanceOf(Error);
        expect((emptyError as Error).message).toMatch(/empty/i);
        expect((emptyError as Error).message).toMatch(/local-model|codex/);

        const randomSpawn = vi.fn(async (_request: LocalModelSpawnRequest) => {
            writeFileSync(randomPath, 'not-an-image');
        });
        const randomError = await runLocalModel({
            ...baseInput(randomPath),
            spawn: randomSpawn,
        }).then(
            () => undefined,
            (error: unknown) => error,
        );
        expect(randomError).toBeInstanceOf(Error);
        expect((randomError as Error).message).toMatch(/invalid/i);
        expect((randomError as Error).message).toMatch(/local-model|codex/);

        const pngSpawn = vi.fn(async (_request: LocalModelSpawnRequest) => {
            writeFileSync(pngPath, Buffer.concat([PNG_MAGIC, Buffer.from('extra')]));
        });
        await expect(
            runLocalModel({
                ...baseInput(pngPath),
                spawn: pngSpawn,
            }),
        ).resolves.toEqual({ outputPath: pngPath });
        expect(pngSpawn.mock.calls[0]?.[0]).toMatchObject({
            stdin: 'ignore',
            timeoutMs: LOCAL_MODEL_TIMEOUT_MS,
        });

        const jpegSpawn = vi.fn(async (_request: LocalModelSpawnRequest) => {
            writeFileSync(jpegPath, Buffer.concat([JPEG_MAGIC, Buffer.from('extra')]));
        });
        await expect(
            runLocalModel({
                ...baseInput(jpegPath),
                spawn: jpegSpawn,
            }),
        ).resolves.toEqual({ outputPath: jpegPath });
    });

    it('rejects a hung local-model spawn after the injected timeout', async () => {
        const outputPath = join(tempDir('illoai-run-timeout-'), 'out.png');
        const spawn = vi.fn((_request: LocalModelSpawnRequest) => new Promise<void>(() => {}));

        let thrown: unknown;
        try {
            await runLocalModel({
                ...baseInput(outputPath),
                timeoutMs: 50,
                spawn,
            });
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(Error);
        const message = thrown instanceof Error ? thrown.message : String(thrown);
        expect(message).toContain('local-model');
        expect(message).toContain('codex');
        expect(message).toContain('50');
    }, 3000);
});
