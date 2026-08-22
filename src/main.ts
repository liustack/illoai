#!/usr/bin/env node

declare const __APP_VERSION__: string;

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Command, CommanderError } from 'commander';
import {
    CONFIG_PATH,
    type ConfigFlags,
    IMAGE_SOURCES,
    type ImageSource,
    initConfigFile,
    loadConfigFile,
    renderConfigShow,
    resolveEffectiveConfig,
    setConfigValue,
} from './config.ts';
import {
    DIMENSION_PRESET_NAMES,
    type DimensionPresetName,
    getDimensionPreset,
} from './dimensions.ts';
import { type DoctorReport, renderDoctorReport, runDoctor } from './doctor.ts';
import { type RenderHtmlOptions, type RenderHtmlResult, renderHtml } from './render/index.ts';
import { createRenderTemplate } from './render/template.ts';
import { listStyles, loadStyle } from './styles/loader.ts';
import type { StyleDefinition } from './styles/schema.ts';
import {
    appendHistory,
    createWorkspace,
    defaultWorkspaceOutputPath,
    findWorkspace,
    listHistory,
    loadStylePack,
    mergedPalette,
} from './workspace/index.ts';

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';
const DEFAULT_RENDER_TEXT = 'One story. One visual language.';

interface OutputWriter {
    write(chunk: string): unknown;
}

export interface CliRuntime {
    stdout: OutputWriter;
    stderr: OutputWriter;
    cwd: string;
    configPath: string;
    renderHtml: (options: RenderHtmlOptions) => Promise<RenderHtmlResult>;
    doctor: () => DoctorReport;
    now: () => Date;
    setExitCode: (code: number) => void;
}

export type CliRuntimeOverrides = Partial<CliRuntime>;

function createRuntime(overrides: CliRuntimeOverrides = {}): CliRuntime {
    const configPath = overrides.configPath ?? CONFIG_PATH;
    return {
        stdout: overrides.stdout ?? process.stdout,
        stderr: overrides.stderr ?? process.stderr,
        cwd: overrides.cwd ?? process.cwd(),
        configPath,
        renderHtml: overrides.renderHtml ?? renderHtml,
        doctor: overrides.doctor ?? (() => runDoctor({ configPath })),
        now: overrides.now ?? (() => new Date()),
        setExitCode: overrides.setExitCode ?? (() => undefined),
    };
}

function parseImageSource(value: string): ImageSource {
    if (!IMAGE_SOURCES.includes(value as ImageSource)) {
        throw new Error(`Unknown source "${value}". Use ${IMAGE_SOURCES.join(', ')}.`);
    }
    return value as ImageSource;
}

function parsePreset(value: string): DimensionPresetName {
    getDimensionPreset(value);
    return value as DimensionPresetName;
}

function parseIntegerOption(name: string, value: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10_000) {
        throw new Error(`${name} must be an integer from 1 to 10000.`);
    }
    return parsed;
}

function parseScaleOption(value: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 4) {
        throw new Error('--scale must be a number from 1 to 4.');
    }
    return parsed;
}

function flagsFromOptions(options: Record<string, string | undefined>): ConfigFlags {
    return {
        ...(options.source ? { source: parseImageSource(options.source) } : {}),
        ...(options.output ? { output: options.output } : {}),
        ...(options.preset ? { preset: parsePreset(options.preset) } : {}),
        ...(options.width ? { width: parseIntegerOption('--width', options.width) } : {}),
        ...(options.height ? { height: parseIntegerOption('--height', options.height) } : {}),
        ...(options.scale ? { scale: parseScaleOption(options.scale) } : {}),
    };
}

function formatStyleListLine(style: StyleDefinition): string {
    const tags: string[] = [style.tier];
    if (style.isFallback) {
        tags.push('fallback');
    }
    if (style.coverOnly) {
        tags.push('cover-only');
    }
    return `${style.name.padEnd(34)}${tags.join(' ').padEnd(22)}${style.scenarios.join('、')}`;
}

function formatStyleDetail(style: StyleDefinition): string {
    return [
        `name: ${style.name}`,
        `displayName: ${style.displayName}`,
        `tier: ${style.tier}`,
        `fallback: ${style.isFallback ? 'yes' : 'no'}`,
        `coverOnly: ${style.coverOnly ? 'yes' : 'no'}`,
        `requiresScene: ${style.requiresScene ? 'yes' : 'no'}`,
        `scenarios: ${style.scenarios.join('、')}`,
        `avoid: ${style.avoid.join('、')}`,
        `canvas: ${style.canvas.strategy}`,
        `guidance: ${style.canvas.guidance}`,
        'palette:',
        ...style.paletteSlots.map((slot) => `  ${slot.name}: ${slot.prompt} / ${slot.css}`),
        'prompt:',
        style.prompt,
        '',
    ].join('\n');
}

export function createProgram(overrides: CliRuntimeOverrides = {}): Command {
    const runtime = createRuntime(overrides);
    const program = new Command();

    program
        .name('illoai')
        .description('Keep every image in an article inside one coherent visual system')
        .version(APP_VERSION)
        .showSuggestionAfterError()
        .configureOutput({
            writeOut: (text) => runtime.stdout.write(text),
            writeErr: (text) => runtime.stderr.write(text),
        })
        .exitOverride();

    program
        .command('gen')
        .description('Generate an image from text')
        .argument('[text]', 'Text rendered into the image', DEFAULT_RENDER_TEXT)
        .option('--source <source>', 'Image source: render, stock, or local-model')
        .option('-o, --output <path>', 'Output PNG path')
        .option('--preset <ratio>', `Canvas preset: ${DIMENSION_PRESET_NAMES.join(', ')}`)
        .option('--width <pixels>', 'Override canvas width')
        .option('--height <pixels>', 'Override canvas height')
        .option('--scale <factor>', 'Device scale factor from 1 to 4')
        .action(async (text: string, options: Record<string, string | undefined>) => {
            const flags = flagsFromOptions(options);
            const effective = resolveEffectiveConfig(loadConfigFile(runtime.configPath), flags);
            if (effective.source !== 'render') {
                throw new Error(
                    `Source "${effective.source}" is not implemented yet. Use --source render.`,
                );
            }

            const workspaceDir = findWorkspace(runtime.cwd);
            const pack = workspaceDir ? loadStylePack(workspaceDir) : undefined;
            const palette = pack ? mergedPalette(pack) : undefined;
            const now = runtime.now();
            const outputPath = flags.output
                ? flags.output
                : workspaceDir
                  ? defaultWorkspaceOutputPath(workspaceDir, now)
                  : effective.output;

            const result = await runtime.renderHtml({
                html: createRenderTemplate(text, palette ? { palette } : {}),
                outputPath,
                width: effective.render.width,
                height: effective.render.height,
                scale: effective.render.scale,
            });

            if (workspaceDir && pack) {
                appendHistory(workspaceDir, {
                    createdAt: now.toISOString(),
                    style: pack.style,
                    palette: palette ?? {},
                    text,
                    output: result.pngPath,
                });
            }

            runtime.stdout.write(
                [
                    `Created ${result.pngPath}`,
                    `Canvas: ${result.meta.width}x${result.meta.height} at ${result.meta.scale}x`,
                    'Privacy: render stayed on this machine.',
                    '',
                ].join('\n'),
            );
        });

    program
        .command('new')
        .description('Create a visual project workspace')
        .argument('<name>', 'Project name')
        .option('--style <style>', 'Catalog style name')
        .action((name: string, options: { style?: string }) => {
            createWorkspace(runtime.cwd, {
                name,
                styleName: options.style,
            });
            runtime.stdout.write(
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
        });

    program
        .command('project')
        .description('Show the current visual project')
        .action(() => {
            const workspaceDir = findWorkspace(runtime.cwd);
            if (!workspaceDir) {
                throw new Error('No IlloAI workspace found. Run illoai new <name> first.');
            }

            const pack = loadStylePack(workspaceDir);
            const palette = mergedPalette(pack);
            runtime.stdout.write(
                [
                    `Project: ${pack.name}`,
                    `Path: ${workspaceDir}`,
                    `Style: ${pack.style}`,
                    `Composition: ${pack.composition.strategy}`,
                    'Palette:',
                    ...Object.entries(palette).map(
                        ([slot, value]) => `  ${slot}: ${value.prompt} / ${value.css}`,
                    ),
                    `Images: ${listHistory(workspaceDir).length}`,
                    '',
                ].join('\n'),
            );
        });

    program
        .command('styles')
        .description('List built-in styles or print one style')
        .argument('[name]', 'Style name')
        .action((name?: string) => {
            if (name) {
                runtime.stdout.write(formatStyleDetail(loadStyle(name)));
                return;
            }

            runtime.stdout.write(`${listStyles().map(formatStyleListLine).join('\n')}\n`);
        });

    const config = program
        .command('config')
        .description(`Manage layered settings in ${runtime.configPath}`)
        .action(() => {
            config.outputHelp();
        });

    config
        .command('init')
        .description('Create a private starter config')
        .option('--force', 'Replace an existing config file')
        .action((options: { force?: boolean }) => {
            initConfigFile(runtime.configPath, Boolean(options.force));
            runtime.stdout.write(`Created ${runtime.configPath} with mode 600.\n`);
        });

    config
        .command('set')
        .description('Set a typed config value')
        .argument('<key>', 'Config key')
        .argument('<value>', 'Config value')
        .action((key: string, value: string) => {
            setConfigValue(key, value, runtime.configPath);
            runtime.stdout.write(`Saved ${key} to ${runtime.configPath}.\n`);
        });

    config
        .command('show')
        .description('Print effective settings with secrets redacted')
        .action(() => {
            runtime.stdout.write(`${renderConfigShow(loadConfigFile(runtime.configPath))}\n`);
        });

    program
        .command('doctor')
        .description('Run offline checks for Node.js, Chromium, and config permissions')
        .action(() => {
            const report = runtime.doctor();
            runtime.stdout.write(`${renderDoctorReport(report)}\n`);
            if (!report.healthy) {
                runtime.setExitCode(1);
            }
        });

    return program;
}

export async function runCli(
    argv: string[] = process.argv,
    overrides: CliRuntimeOverrides = {},
): Promise<number> {
    let exitCode = 0;
    const runtime = createRuntime({
        ...overrides,
        setExitCode: (code) => {
            exitCode = Math.max(exitCode, code);
            overrides.setExitCode?.(code);
        },
    });
    const program = createProgram(runtime);

    try {
        await program.parseAsync(argv);
    } catch (error) {
        if (error instanceof CommanderError) {
            return error.exitCode;
        }
        runtime.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
        return 1;
    }

    return exitCode;
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryPath === import.meta.url) {
    process.exitCode = await runCli();
}
