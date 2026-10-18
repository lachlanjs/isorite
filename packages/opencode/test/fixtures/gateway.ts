// A scripted OpenAI-compatible endpoint: what `isorite term` is pointed at as its gateway in
// tests, so they need no network and no key. Each request is answered by the script with the
// conversation so far; it replies with text or with a tool call, streamed as the API streams.

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export interface Message { role: string; content?: unknown; tool_calls?: unknown[] }
export interface Request { messages: Message[]; tools: string[]; authorization: string | undefined }
export type Reply = { text: string } | { tool: string; args: object };
export type Script = (request: Request) => Reply;

export interface Gateway {
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

export async function startGateway(script: Script): Promise<Gateway> {
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
      if ("tool" in reply) {
        const call = { index: 0, id: `call_${requests.length}`, type: "function", function: { name: reply.tool, arguments: JSON.stringify(reply.args) } };
        chunk([{ index: 0, delta: { role: "assistant", tool_calls: [call] }, finish_reason: null }]);
        chunk([{ index: 0, delta: {}, finish_reason: "tool_calls" }]);
      } else {
        chunk([{ index: 0, delta: { role: "assistant", content: reply.text }, finish_reason: null }]);
        chunk([{ index: 0, delta: {}, finish_reason: "stop" }]);
      }
      chunk([], { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
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
