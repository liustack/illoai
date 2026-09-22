import { describe, expect, it } from 'vitest';
import { assertSafeRemoteTarget, isBlockedHostname, isPrivateIpAddress } from './ssrf.ts';

describe('ssrf guards', () => {
    it('blocks loopback, link-local, private, and metadata hosts', () => {
        expect(isBlockedHostname('localhost')).toBe(true);
        expect(isBlockedHostname('foo.localhost')).toBe(true);
        expect(isBlockedHostname('metadata.google.internal')).toBe(true);
        expect(isBlockedHostname('images.pexels.com')).toBe(false);

        expect(isPrivateIpAddress('127.0.0.1')).toBe(true);
        expect(isPrivateIpAddress('10.1.2.3')).toBe(true);
        expect(isPrivateIpAddress('172.16.0.9')).toBe(true);
        expect(isPrivateIpAddress('192.168.1.1')).toBe(true);
        expect(isPrivateIpAddress('169.254.169.254')).toBe(true);
        expect(isPrivateIpAddress('100.64.0.1')).toBe(true);
        expect(isPrivateIpAddress('::1')).toBe(true);
        expect(isPrivateIpAddress('fe80::1')).toBe(true);
        expect(isPrivateIpAddress('fd00::1')).toBe(true);
        expect(isPrivateIpAddress('::ffff:127.0.0.1')).toBe(true);
        expect(isPrivateIpAddress('not-an-ip')).toBe(true);

        expect(isPrivateIpAddress('8.8.8.8')).toBe(false);
        expect(isPrivateIpAddress('2606:4700::1111')).toBe(false);
    });

    it('rejects a hostname when any resolved address is private', async () => {
        const lookup = async () => [
            { address: '104.16.1.1', family: 4 },
            { address: '10.0.0.5', family: 4 },
        ];
        await expect(
            assertSafeRemoteTarget(new URL('https://cdn.example.com/a.jpg'), lookup),
        ).rejects.toThrowError(
            'Blocked private or reserved download target: cdn.example.com -> 10.0.0.5',
        );
    });

    it('pins the first public address that resolved', async () => {
        const lookup = async () => [{ address: '104.16.1.1', family: 4 }];
        await expect(
            assertSafeRemoteTarget(new URL('https://cdn.example.com/a.jpg'), lookup),
        ).resolves.toEqual({ hostname: 'cdn.example.com', address: '104.16.1.1', family: 4 });
    });

    it('rejects literal private IPs and empty resolutions', async () => {
        await expect(
            assertSafeRemoteTarget(new URL('https://127.0.0.1/a.jpg'), async () => []),
        ).rejects.toThrowError('Blocked private or reserved download target: 127.0.0.1');
        await expect(
            assertSafeRemoteTarget(new URL('https://nowhere.example/a.jpg'), async () => []),
        ).rejects.toThrowError('Host nowhere.example did not resolve to any IP address.');
    });
});
