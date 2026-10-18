// A scripted OpenAI-compatible endpoint: what `isorite term` is pointed at as its gateway in the
// tests and in the tutorial, so they need no network and no key. Each request is answered by the
// script with the conversation so far; it replies with text, a tool call, or several at once (as Iso asks for
// its look-ups), streamed as the API streams.

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export interface Message { role: string; content?: unknown; tool_calls?: unknown[] }
export interface Request { messages: Message[]; tools: string[]; authorization: string | undefined }
/** What a reply cost, as OpenRouter reports it: Iso shows it. */
export interface Usage { in: number; out: number; cached?: number; usd: number }
export type Reply = { text: string; usage?: Usage } | { tool: string; args: object } | { calls: { name: string; arguments: object }[]; usage?: Usage };
export type Script = (request: Request) => Reply;

export interface Scripted {
  /** The base URL, as ISORITE_GATEWAY_URL takes it. */
  url: string;
  requests: Request[];
  close(): Promise<void>;
}

/** The last thing the person said. */
export function lastAsked(request: Request): string {
  const user = request.messages.filter((m) => m.role === "user").at(-1)?.content;
  if (typeof user === "string") return user;
  if (Array.isArray(user)) return user.map((part) => (part as { text?: string }).text ?? "").join("");
  return "";
}

export async function startScripted(script: Script): Promise<Scripted> {
  const requests: Request[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (req.url?.endsWith("/models")) {
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: [] }));
        return;
      }
      const json = JSON.parse(body || "{}") as { messages?: Message[]; tools?: { function?: { name: string } }[] };
      const request: Request = {
        messages: json.messages ?? [],
        tools: (json.tools ?? []).flatMap((t) => (t.function ? [t.function.name] : [])),
        authorization: req.headers.authorization,
      };
      requests.push(request);
      const reply = script(request);
      res.writeHead(200, { "content-type": "text/event-stream" });
      const chunk = (choices: object[], extra: object = {}) =>
        res.write(`data: ${JSON.stringify({ id: "scripted", object: "chat.completion.chunk", created: 0, model: "scripted", choices, ...extra })}\n\n`);
      const calls = "tool" in reply ? [{ name: reply.tool, arguments: reply.args }] : "calls" in reply ? reply.calls : [];
      if (calls.length) {
        const tool_calls = calls.map((c, index) => ({ index, id: `call_${requests.length}_${index}`, type: "function", function: { name: c.name, arguments: JSON.stringify(c.arguments) } }));
        chunk([{ index: 0, delta: { role: "assistant", tool_calls }, finish_reason: null }]);
        chunk([{ index: 0, delta: {}, finish_reason: "tool_calls" }]);
      } else {
        chunk([{ index: 0, delta: { role: "assistant", content: "text" in reply ? reply.text : "" }, finish_reason: null }]);
        chunk([{ index: 0, delta: {}, finish_reason: "stop" }]);
      }
      const u = "usage" in reply && reply.usage ? reply.usage : { in: 10, out: 5, usd: 0 };
      chunk([], { usage: { prompt_tokens: u.in, completion_tokens: u.out, total_tokens: u.in + u.out, cost: u.usd, prompt_tokens_details: { cached_tokens: u.cached ?? 0 } } });
      res.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}
