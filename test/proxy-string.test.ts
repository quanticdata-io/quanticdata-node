import { describe, expect, it } from 'vitest';
import { parseProxyString, proxyStringToUrl, ProxyStringError, toProxyUrl } from '../src';

describe('parseProxyString', () => {
  it.each([
    ['user:pass@gw.example.net:8080', { protocol: 'http', host: 'gw.example.net', port: 8080, username: 'user', password: 'pass' }],
    ['gw.example.net:8080:user:pass', { protocol: 'http', host: 'gw.example.net', port: 8080, username: 'user', password: 'pass' }],
    ['203.0.113.7:9000:user:pass', { protocol: 'http', host: '203.0.113.7', port: 9000, username: 'user', password: 'pass' }],
    ['http://user:pass@gw.example.net:8080', { protocol: 'http', host: 'gw.example.net', port: 8080, username: 'user', password: 'pass' }],
    ['socks5://user:pass@gw.example.net:1080', { protocol: 'socks5', host: 'gw.example.net', port: 1080, username: 'user', password: 'pass' }],
    ['gw.example.net:8080', { protocol: 'http', host: 'gw.example.net', port: 8080 }],
  ])('parses %s', (line, expected) => {
    expect(parseProxyString(line)).toEqual(expected);
  });

  it('keeps targeting segments in the username untouched', () => {
    const p = parseProxyString('user_8c21-country-us-sid-k3f9a1b2-ttl-10m:p4ss@gw.example.net:8080');
    expect(p.username).toBe('user_8c21-country-us-sid-k3f9a1b2-ttl-10m');
  });

  it('accepts a password containing "@" and ":"', () => {
    expect(parseProxyString('u:p@ss:w0rd@h.example:1')).toMatchObject({ username: 'u', password: 'p@ss:w0rd', host: 'h.example', port: 1 });
    expect(parseProxyString('h.example:1:u:pa:ss')).toMatchObject({ username: 'u', password: 'pa:ss' });
  });

  it('uses the default protocol for scheme-less strings', () => {
    expect(parseProxyString('u:p@h.example:1080', 'socks5').protocol).toBe('socks5');
  });

  it.each(['', 'h.example', 'u:p@h.example', 'ftp://u:p@h.example:21', 'h.example:99999', 'a:b:c'])('rejects %j', (line) => {
    expect(() => parseProxyString(line)).toThrow(ProxyStringError);
  });
});

describe('toProxyUrl', () => {
  it('percent-encodes credentials', () => {
    expect(toProxyUrl({ protocol: 'http', host: 'h.example', port: 8080, username: 'u', password: 'p@ss/w:rd' })).toBe(
      'http://u:p%40ss%2Fw%3Ard@h.example:8080',
    );
  });

  it('brackets IPv6 hosts', () => {
    expect(toProxyUrl({ protocol: 'http', host: '2001:db8::1', port: 8080 })).toBe('http://[2001:db8::1]:8080');
  });

  it('round-trips every documented format to the same URL', () => {
    const want = 'http://user:pass@gw.example.net:8080';
    for (const line of ['user:pass@gw.example.net:8080', 'gw.example.net:8080:user:pass', 'http://user:pass@gw.example.net:8080']) {
      expect(proxyStringToUrl(line)).toBe(want);
    }
  });
});
