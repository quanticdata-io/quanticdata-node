import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES_DIR } from './mock-server';

export const TEST_KEY = 'qd_test_0000000000000000000000000000000000000000000000000000000000000000';

export interface FakeRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

export interface FakeReply {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** A `fetch` stand-in that records every call and answers with `handler`'s reply. */
export function fakeFetch(handler: (req: FakeRequest, n: number) => FakeReply | Promise<FakeReply> | Error) {
  const calls: FakeRequest[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const req = { method: init?.method ?? 'GET', url, headers, body };
    calls.push(req);
    const reply = await handler(req, calls.length);
    if (reply instanceof Error) throw reply;
    const status = reply.status ?? 200;
    const isText = typeof reply.body === 'string';
    return new Response(isText ? (reply.body as string) : JSON.stringify(reply.body ?? {}), {
      status,
      headers: { 'content-type': isText ? 'text/plain' : 'application/json', ...reply.headers },
    });
  };
  return { fetch: fn as typeof fetch, calls };
}

/** The documented example body of an operation for a status (from test/fixtures). */
export function fixture<T = { type: string; message: string; payload: Record<string, unknown> }>(operationId: string, status = '200'): T {
  const f = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, `${operationId}.json`), 'utf8')) as {
    responses: Record<string, { body: unknown }>;
  };
  const r = f.responses[status];
  if (!r) throw new Error(`No ${status} example for ${operationId}`);
  return structuredClone(r.body) as T;
}

export const ok = (payload: unknown, message = 'OK') => ({ body: { type: 'response', message, payload, pagination: {} } });
