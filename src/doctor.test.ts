import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderDoctorReport, runDoctor } from './doctor.ts';

const tempDirectories: string[] = [];

afterEach(() => {
    for (const directory of tempDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe('offline doctor', () => {
    it('checks Node, the Chromium executable, and private config permissions', () => {
        const directory = mkdtempSync(join(tmpdir(), 'illoai-doctor-'));
        tempDirectories.push(directory);
        const chromiumPath = join(directory, 'chromium');
        const configPath = join(directory, 'config.json');
        writeFileSync(chromiumPath, '#!/bin/sh\n', { mode: 0o700 });
        writeFileSync(configPath, '{}\n', { mode: 0o600 });

        const healthy = runDoctor({
            nodeVersion: '22.19.0',
            chromiumPath,
            configPath,
            platform: 'darwin',
        });

        expect(healthy.healthy).toBe(true);
        expect(healthy.checks.map((check) => [check.id, check.status])).toEqual([
            ['node', 'ok'],
            ['chromium', 'ok'],
            ['config-permissions', 'ok'],
        ]);
        expect(renderDoctorReport(healthy)).toContain('IlloAI doctor: healthy');

        chmodSync(configPath, 0o644);
        const unsafe = runDoctor({
            nodeVersion: '22.19.0',
            chromiumPath,
            configPath,
            platform: 'darwin',
        });
        expect(unsafe.healthy).toBe(false);
        expect(unsafe.checks.at(-1)).toMatchObject({
            id: 'config-permissions',
            status: 'error',
        });
    });
});
