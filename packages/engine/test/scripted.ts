// A provider that says what a test tells it to: each call to it is answered by
// the next reply in the script, as a stream of server-sent events, and what
// it was sent is kept to be looked at.

import type { Http } from "../src/index.ts";

export interface Scripted {
  /** Text, in the pieces it streams as. */
  text?: string[];
  /** Tools it calls instead of finishing. */
  calls?: { name: string; arguments: Record<string, unknown> }[];
  usage?: { prompt_tokens: number; completion_tokens: number; cost: number; cached?: number };
  /** Reply with this status instead. */
  status?: number;
  /** Wait for this before the last piece, so a test can stop it mid-stream. */
  hold?: Promise<void>;
}

export interface Sent { model: string; messages: { role: string; content: unknown; tool_calls?: unknown }[]; tools?: { function: { name: string } }[]; tool_choice?: string }

export function scripted(script: Scripted[]): { http: Http; sent: Sent[]; headers: Record<string, string>[] } {
  const sent: Sent[] = [], headers: Record<string, string>[] = [];
  const fetch = (async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)) as Sent);
    headers.push(init?.headers as Record<string, string>);
    const next = script.shift();
    if (!next) throw new Error("the script has no more replies");
    if (next.status) return new Response(JSON.stringify({ error: { message: "refused" } }), { status: next.status, headers: { "content-type": "application/json" } });
    const data = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
    const signal = init?.signal;
    const body = new ReadableStream<Uint8Array>({
      async start(c) {
        const enc = new TextEncoder(), pieces = next.text ?? [];
        try {
          for (const [k, piece] of pieces.entries()) {
            if (k === pieces.length - 1 && next.hold) await Promise.race([next.hold, new Promise((_, no) => signal?.addEventListener("abort", () => no(Object.assign(new Error("aborted"), { name: "AbortError" }))))]);
            c.enqueue(enc.encode(data({ choices: [{ delta: { content: piece } }] })));
          }
          for (const [index, call] of (next.calls ?? []).entries()) {
            // A call arrives in pieces: its name, then its arguments in two halves.
            const args = JSON.stringify(call.arguments), half = Math.ceil(args.length / 2);
            c.enqueue(enc.encode(data({ choices: [{ delta: { tool_calls: [{ index, id: `call_${sent.length}_${index}`, function: { name: call.name, arguments: args.slice(0, half) } }] } }] })));
            c.enqueue(enc.encode(data({ choices: [{ delta: { tool_calls: [{ index, function: { arguments: args.slice(half) } }] } }] })));
          }
          const u = next.usage ?? { prompt_tokens: 1000, completion_tokens: 50, cost: 0.004 };
          c.enqueue(enc.encode(data({ choices: [{ delta: {}, finish_reason: next.calls ? "tool_calls" : "stop" }] })));
          c.enqueue(enc.encode(data({ choices: [], usage: { prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens, cost: u.cost, prompt_tokens_details: { cached_tokens: u.cached ?? 0 } } })));
          c.enqueue(enc.encode("data: [DONE]\n\n"));
          c.close();
        } catch (e) { c.error(e); }
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  }) as typeof globalThis.fetch;
  return { http: { fetch }, sent, headers };
}
