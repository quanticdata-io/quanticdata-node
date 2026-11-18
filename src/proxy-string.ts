/**
 * Helpers for the proxy strings returned by `POST /public/proxies/generate`.
 *
 * The API returns ready-to-use strings in the `format` you ask for; these
 * helpers only parse them and turn them into URLs that HTTP clients accept
 * (`undici` ProxyAgent, `https-proxy-agent`, `curl -x`, Playwright, ...).
 * They never build usernames themselves: targeting options are applied by the
 * API when it generates the strings.
 */

export type ProxyProtocol = 'http' | 'https' | 'socks5';

export interface ParsedProxy {
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username?: string;
  password?: string;
}

/** The string formats `POST /public/proxies/generate` and the Premium ISP lines endpoint can return. */
export const PROXY_STRING_FORMATS = [
  'user:pass@host:port',
  'host:port:user:pass',
  'ip:port:user:pass',
  'http://user:pass@host:port',
  'socks5://user:pass@host:port',
] as const;

export class ProxyStringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProxyStringError';
  }
}

function toPort(raw: string, line: string): number {
  const port = Number(raw);
  if (!/^\d{1,5}$/.test(raw) || port < 1 || port > 65535) throw new ProxyStringError(`Invalid port "${raw}" in proxy string "${line}"`);
  return port;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Parses one proxy string. Accepted shapes:
 * `scheme://user:pass@host:port`, `user:pass@host:port`, `host:port:user:pass`, `host:port`.
 *
 * @param defaultProtocol protocol to assume when the string has no scheme (default `http`).
 */
export function parseProxyString(line: string, defaultProtocol: ProxyProtocol = 'http'): ParsedProxy {
  const input = line.trim();
  if (!input) throw new ProxyStringError('Empty proxy string');

  const scheme = /^([a-z0-9]+):\/\//i.exec(input);
  let protocol: ProxyProtocol = defaultProtocol;
  let rest = input;
  if (scheme) {
    const s = scheme[1]!.toLowerCase();
    if (s === 'socks5h' || s === 'socks') protocol = 'socks5';
    else if (s === 'http' || s === 'https' || s === 'socks5') protocol = s;
    else throw new ProxyStringError(`Unsupported proxy scheme "${s}" in "${line}"`);
    rest = input.slice(scheme[0].length).replace(/\/+$/, '');
  }

  const at = rest.lastIndexOf('@');
  if (at >= 0) {
    const cred = rest.slice(0, at);
    const hostPort = rest.slice(at + 1);
    const colon = cred.indexOf(':');
    const hp = hostPort.lastIndexOf(':');
    if (hp <= 0) throw new ProxyStringError(`Missing port in proxy string "${line}"`);
    return {
      protocol,
      host: hostPort.slice(0, hp),
      port: toPort(hostPort.slice(hp + 1), line),
      username: safeDecode(colon >= 0 ? cred.slice(0, colon) : cred),
      password: colon >= 0 ? safeDecode(cred.slice(colon + 1)) : undefined,
    };
  }

  const parts = rest.split(':');
  if (parts.length === 2) {
    return { protocol, host: parts[0]!, port: toPort(parts[1]!, line) };
  }
  if (parts.length >= 4) {
    // host:port:user:pass (the password may itself contain ':')
    return {
      protocol,
      host: parts[0]!,
      port: toPort(parts[1]!, line),
      username: parts[2]!,
      password: parts.slice(3).join(':'),
    };
  }
  throw new ProxyStringError(`Unrecognised proxy string "${line}"`);
}

/** Formats a parsed proxy as a URL (`http://user:pass@host:port`), percent-encoding the credentials. */
export function toProxyUrl(proxy: ParsedProxy): string {
  const auth =
    proxy.username !== undefined
      ? `${encodeURIComponent(proxy.username)}${proxy.password !== undefined ? `:${encodeURIComponent(proxy.password)}` : ''}@`
      : '';
  const host = proxy.host.includes(':') && !proxy.host.startsWith('[') ? `[${proxy.host}]` : proxy.host;
  return `${proxy.protocol}://${auth}${host}:${proxy.port}`;
}

/** Shorthand: parse a proxy string in any supported format and return it as a URL. */
export function proxyStringToUrl(line: string, defaultProtocol: ProxyProtocol = 'http'): string {
  return toProxyUrl(parseProxyString(line, defaultProtocol));
}
