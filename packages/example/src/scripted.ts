// A provider that answers from a script instead of a model: the network port the engine is given, so Iso's
// requests go through every part of the engine as they would to a real one. The example's history is made with
// it.

import type { Http } from "@isorite/engine";

/** One answer to one request: text, or tool calls to make first, and what it cost. */
export interface Reply {
  text?: string;
  calls?: { name: string; arguments: Record<string, unknown> }[];
  usage?: { in: number; out: number; cached?: number; usd: number };
}

/** What a request to the provider carried, for the script to choose its answer by. */
export interface Request {
  model: string;
  messages: { role: string; content: unknown }[];
  tools?: { function: { name: string } }[];
}

/** `answer` is asked for each request in turn. `pace` is the wait between pieces of streamed text, in milliseconds:
 *  none for the history, a little for an answerer seen at work (the guide's finder), so the reply is seen arriving. */
export function scriptedHttp(answer: (request: Request) => Reply, pace = 0): Http {
  const fetch = (async (_url: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as Request;
    const reply = answer(request), signal = init?.signal ?? null;
    const data = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;
    const wait = (ms: number) => new Promise<void>((done, stop) => {
      if (signal?.aborted) { stop(Object.assign(new Error("aborted"), { name: "AbortError" })); return; }
      const t = setTimeout(done, ms);
      signal?.addEventListener("abort", () => { clearTimeout(t); stop(Object.assign(new Error("aborted"), { name: "AbortError" })); });
    });
    const body = new ReadableStream<Uint8Array>({
      async start(c) {
        const enc = new TextEncoder(), send = (o: unknown) => c.enqueue(enc.encode(data(o)));
        try {
          const text = reply.text ?? "";
          for (const piece of pace ? text.match(/[\s\S]{1,14}/g) ?? [] : text ? [text] : []) {
            send({ model: request.model, choices: [{ delta: { content: piece } }] });
            if (pace) await wait(pace);
          }
          for (const [index, call] of (reply.calls ?? []).entries()) {
            send({ choices: [{ delta: { tool_calls: [{ index, id: `call_${index}_${Math.random().toString(36).slice(2, 8)}`, function: { name: call.name, arguments: JSON.stringify(call.arguments) } }] } }] });
          }
          if (pace && reply.calls) await wait(pace * 20);
          const u = reply.usage ?? { in: 3000, out: 200, usd: 0.008 };
          send({ choices: [{ delta: {}, finish_reason: reply.calls ? "tool_calls" : "stop" }] });
          send({ choices: [], usage: { prompt_tokens: u.in, completion_tokens: u.out, cost: u.usd, prompt_tokens_details: { cached_tokens: u.cached ?? 0 } } });
          c.enqueue(enc.encode("data: [DONE]\n\n"));
          c.close();
        } catch (e) { c.error(e); }
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  }) as typeof globalThis.fetch;
  return { fetch };
}
