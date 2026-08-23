import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { type DimensionPresetName, getDimensionPreset } from './dimensions.ts';

export const CONFIG_PATH = join(homedir(), '.illoai', 'config.json');

export const IMAGE_SOURCES = ['render', 'stock', 'local-model'] as const;
export type ImageSource = (typeof IMAGE_SOURCES)[number];

export const LOCAL_MODEL_PROVIDERS = ['codex', 'grok', 'claude'] as const;
export type LocalModelProvider = (typeof LOCAL_MODEL_PROVIDERS)[number];

export interface IlloAIConfigFile {
    source?: ImageSource;
    output?: string;
    render?: {
        preset?: DimensionPresetName;
        width?: number;
        height?: number;
        scale?: number;
    };
    stock?: {
        apiKey?: string;
        baseUrl?: string;
    };
    localModel?: {
        via?: LocalModelProvider;
    };
}

export interface ConfigFlags {
    source?: ImageSource;
    output?: string;
    preset?: DimensionPresetName;
    width?: number;
    height?: number;
    scale?: number;
    via?: LocalModelProvider;
}

export interface EffectiveConfig {
    source: ImageSource;
    output: string;
    render: {
        preset: DimensionPresetName;
        width: number;
        height: number;
        scale: number;
    };
    stock?: IlloAIConfigFile['stock'];
    localModel?: IlloAIConfigFile['localModel'];
}

export const BUILT_IN_CONFIG = {
    source: 'render',
    output: 'illoai.png',
    render: {
        preset: '16:9',
        scale: 1,
    },
} as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function writeConfigFile(config: IlloAIConfigFile, configPath: string): void {
    mkdirSync(dirname(configPath), { recursive: true, mode: 0o700 });
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
    });
    chmodSync(configPath, 0o600);
}

function parseIntegerSetting(key: string, value: string, minimum: number, maximum: number): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
        throw new Error(`${key} must be an integer from ${minimum} to ${maximum}.`);
    }
    return parsed;
}

function parseScaleSetting(value: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 4) {
        throw new Error('render.scale must be a number from 1 to 4.');
    }
    return parsed;
}

function invalidConfig(configPath: string, key: string, expectation: string): never {
    throw new Error(`${configPath} has invalid "${key}". Expected ${expectation}.`);
}

function validateConfig(parsed: Record<string, unknown>, configPath: string): IlloAIConfigFile {
    const rootKeys = new Set(['source', 'output', 'render', 'stock', 'localModel']);
    for (const key of Object.keys(parsed)) {
        if (!rootKeys.has(key)) {
            throw new Error(`${configPath} contains unknown config key "${key}".`);
        }
    }

    if (
        parsed.source !== undefined &&
        (typeof parsed.source !== 'string' || !IMAGE_SOURCES.includes(parsed.source as ImageSource))
    ) {
        invalidConfig(configPath, 'source', `one of ${IMAGE_SOURCES.join(', ')}`);
    }
    if (
        parsed.output !== undefined &&
        (typeof parsed.output !== 'string' || parsed.output.trim() === '')
    ) {
        invalidConfig(configPath, 'output', 'a non-empty string');
    }

    if (parsed.render !== undefined) {
        if (!isPlainObject(parsed.render)) {
            invalidConfig(configPath, 'render', 'an object');
        }
        const renderKeys = new Set(['preset', 'width', 'height', 'scale']);
        for (const key of Object.keys(parsed.render)) {
            if (!renderKeys.has(key)) {
                throw new Error(`${configPath} contains unknown config key "render.${key}".`);
            }
        }
        if (parsed.render.preset !== undefined) {
            if (typeof parsed.render.preset !== 'string') {
                invalidConfig(configPath, 'render.preset', 'a dimension preset name');
            }
            try {
                getDimensionPreset(parsed.render.preset);
            } catch {
                invalidConfig(configPath, 'render.preset', 'one of 16:9, 5:2, 3:2, 3:4');
            }
        }
        for (const key of ['width', 'height'] as const) {
            const value = parsed.render[key];
            if (
                value !== undefined &&
                (typeof value !== 'number' ||
                    !Number.isInteger(value) ||
                    value < 1 ||
                    value > 10_000)
            ) {
                invalidConfig(configPath, `render.${key}`, 'an integer from 1 to 10000');
            }
        }
        const scale = parsed.render.scale;
        if (
            scale !== undefined &&
            (typeof scale !== 'number' || !Number.isFinite(scale) || scale < 1 || scale > 4)
        ) {
            invalidConfig(configPath, 'render.scale', 'a number from 1 to 4');
        }
    }

    if (parsed.stock !== undefined) {
        if (!isPlainObject(parsed.stock)) {
            invalidConfig(configPath, 'stock', 'an object');
        }
        const stockKeys = new Set(['apiKey', 'baseUrl']);
        for (const key of Object.keys(parsed.stock)) {
            if (!stockKeys.has(key)) {
                throw new Error(`${configPath} contains unknown config key "stock.${key}".`);
            }
        }
        if (parsed.stock.apiKey !== undefined && typeof parsed.stock.apiKey !== 'string') {
            invalidConfig(configPath, 'stock.apiKey', 'a string');
        }
        if (parsed.stock.baseUrl !== undefined && typeof parsed.stock.baseUrl !== 'string') {
            invalidConfig(configPath, 'stock.baseUrl', 'a URL string');
        }
        if (typeof parsed.stock.baseUrl === 'string') {
            try {
                const url = new URL(parsed.stock.baseUrl);
                if (url.protocol !== 'https:' && url.protocol !== 'http:') {
                    invalidConfig(configPath, 'stock.baseUrl', 'an http or https URL');
                }
            } catch {
                invalidConfig(configPath, 'stock.baseUrl', 'an http or https URL');
            }
        }
    }

    if (parsed.localModel !== undefined) {
        if (!isPlainObject(parsed.localModel)) {
            invalidConfig(configPath, 'localModel', 'an object');
        }
        for (const key of Object.keys(parsed.localModel)) {
            if (key !== 'via') {
                throw new Error(`${configPath} contains unknown config key "localModel.${key}".`);
            }
        }
        if (
            parsed.localModel.via !== undefined &&
            (typeof parsed.localModel.via !== 'string' ||
                !LOCAL_MODEL_PROVIDERS.includes(parsed.localModel.via as LocalModelProvider))
        ) {
            invalidConfig(
                configPath,
                'localModel.via',
                `one of ${LOCAL_MODEL_PROVIDERS.join(', ')}`,
            );
        }
    }

    return parsed as IlloAIConfigFile;
}

export function loadConfigFile(configPath = CONFIG_PATH): IlloAIConfigFile {
    let raw: string;
    try {
        raw = readFileSync(configPath, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return {};
        }
        throw new Error(
            `Cannot read ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error(`${configPath} is not valid JSON.`);
    }

    if (!isPlainObject(parsed)) {
        throw new Error(`${configPath} must contain a JSON object.`);
    }

    return validateConfig(parsed, configPath);
}

export function initConfigFile(configPath = CONFIG_PATH, force = false): void {
    if (!force && existsSync(configPath)) {
        throw new Error(`${configPath} already exists. Use --force to replace it.`);
    }

    writeConfigFile({}, configPath);
}

export function setConfigValue(
    dottedKey: string,
    rawValue: string,
    configPath = CONFIG_PATH,
): void {
    const value = rawValue.trim();
    const config = loadConfigFile(configPath);

    switch (dottedKey) {
        case 'source': {
            if (!IMAGE_SOURCES.includes(value as ImageSource)) {
                throw new Error(`source must be one of ${IMAGE_SOURCES.join(', ')}.`);
            }
            config.source = value as ImageSource;
            break;
        }
        case 'output': {
            if (value === '') {
                throw new Error('output must not be empty.');
            }
            config.output = value;
            break;
        }
        case 'render.preset': {
            getDimensionPreset(value);
            config.render ??= {};
            config.render.preset = value as DimensionPresetName;
            break;
        }
        case 'render.width':
        case 'render.height': {
            config.render ??= {};
            const field = dottedKey.slice('render.'.length) as 'width' | 'height';
            config.render[field] = parseIntegerSetting(dottedKey, value, 1, 10_000);
            break;
        }
        case 'render.scale': {
            config.render ??= {};
            config.render.scale = parseScaleSetting(value);
            break;
        }
        case 'stock.apiKey': {
            config.stock ??= {};
            config.stock.apiKey = rawValue;
            break;
        }
        case 'stock.baseUrl': {
            const url = new URL(value);
            if (url.protocol !== 'https:' && url.protocol !== 'http:') {
                throw new Error('stock.baseUrl must use http or https.');
            }
            config.stock ??= {};
            config.stock.baseUrl = url.toString();
            break;
        }
        case 'localModel.via': {
            if (!LOCAL_MODEL_PROVIDERS.includes(value as LocalModelProvider)) {
                throw new Error(
                    `localModel.via must be one of ${LOCAL_MODEL_PROVIDERS.join(', ')}.`,
                );
            }
            config.localModel ??= {};
            config.localModel.via = value as LocalModelProvider;
            break;
        }
        default:
            throw new Error(`Unknown config key "${dottedKey}".`);
    }

    writeConfigFile(config, configPath);
}

export function resolveEffectiveConfig(
    fileConfig: IlloAIConfigFile,
    flags: ConfigFlags,
): EffectiveConfig {
    const preset = flags.preset ?? fileConfig.render?.preset ?? BUILT_IN_CONFIG.render.preset;
    const dimensions = getDimensionPreset(preset);

    return {
        source: flags.source ?? fileConfig.source ?? BUILT_IN_CONFIG.source,
        output: flags.output ?? fileConfig.output ?? BUILT_IN_CONFIG.output,
        render: {
            preset,
            width: flags.width ?? fileConfig.render?.width ?? dimensions.width,
            height: flags.height ?? fileConfig.render?.height ?? dimensions.height,
            scale: flags.scale ?? fileConfig.render?.scale ?? BUILT_IN_CONFIG.render.scale,
        },
        ...(fileConfig.stock ? { stock: { ...fileConfig.stock } } : {}),
        ...(fileConfig.localModel ? { localModel: { ...fileConfig.localModel } } : {}),
    };
}

function redactUrlCredentials(value: string): string {
    const url = new URL(value);
    if (url.username === '' && url.password === '') {
        return value;
    }

    return `${url.protocol}//[redacted]@${url.host}${url.pathname}${url.search}${url.hash}`;
}

export function renderConfigShow(fileConfig: IlloAIConfigFile): string {
    const effective = resolveEffectiveConfig(fileConfig, {});
    const redacted: EffectiveConfig = {
        ...effective,
        ...(effective.stock
            ? {
                  stock: {
                      ...effective.stock,
                      ...(effective.stock.apiKey ? { apiKey: '[redacted]' } : {}),
                      ...(effective.stock.baseUrl
                          ? { baseUrl: redactUrlCredentials(effective.stock.baseUrl) }
                          : {}),
                  },
              }
            : {}),
    };

    return JSON.stringify(redacted, null, 2);
}
