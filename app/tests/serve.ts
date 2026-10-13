// The server the browser tests run against: a small base made fresh in a
// temporary folder, with its study base, served on its own port. Nothing of
// yours is read or written: the device's configuration is kept there too.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const PORT = 4799;
export const ROOT = join(tmpdir(), "isorite-browser-tests");
export const NOTES = join(ROOT, "information-theory");

export const PROVIDER_PORT = 4798;
export const REPLY = "It is measured in **bits**, as [Surprise](/basics/surprise.md) is.\n\n$$\nH(X) \\le \\log_2 n\n$$";

/** A provider that speaks the chat completions protocol and says what the prompt's words call for:
 *  "look" looks a note up first, "slow" never finishes, "fail" refuses; anything else is answered with REPLY. */
async function provider(): Promise<void> {
  const { createServer } = await import("node:http");
  createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const sent = JSON.parse(body) as { messages: { role: string; content: unknown }[] };
    const user = String(sent.messages.find((m) => m.role === "user")?.content ?? "");
    const asked = user.split("# What they ask now").at(-1) ?? "";
    const looked = sent.messages.some((m) => m.role === "tool");
    if (asked.includes("fail")) { res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "the scripted provider was told to fail" } })); return; }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const data = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    if (user.includes("⟦1⟧")) {
      // A rewrite: each chosen passage comes back as "rewritten k" ("drop" takes the second out), with a remark
      // outside the marks that must be dropped, and a word on the changes ("quiet" says nothing).
      const count = new Set(user.match(/⟦\d+⟧/g)).size;
      data({ choices: [{ delta: { content: "Here is the rewrite.\n" } }] });
      for (let k = 1; k <= count; k++) data({ choices: [{ delta: { content: `⟦${k}⟧${asked.includes("drop") && k === 2 ? "" : ` rewritten ${k} `}⟦/${k}⟧\n` } }] });
      if (!asked.includes("quiet")) data({ choices: [{ delta: { content: "⟦note⟧I rewrote what you chose, **plainly**.⟦/note⟧" } }] });
    } else if (asked.includes("look") && !looked) {
      data({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "read_note", arguments: JSON.stringify({ id: "/basics/surprise.md" }) } }] } }] });
    } else {
      const pieces = REPLY.match(/[\s\S]{1,12}/g)!;
      for (const [k, piece] of pieces.entries()) {
        data({ choices: [{ delta: { content: piece } }] });
        await wait(asked.includes("slow") && k === 1 ? 60_000 : asked.includes("look") ? 60 : 15);
        if (res.destroyed) return;
      }
    }
    data({ choices: [], usage: { prompt_tokens: 2000, completion_tokens: 40, cost: 0.0123, prompt_tokens_details: { cached_tokens: 0 } } });
    res.end("data: [DONE]\n\n");
  }).listen(PROVIDER_PORT, "127.0.0.1");
}

if (process.argv[1] === import.meta.filename) {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(NOTES, "basics"), { recursive: true });
  mkdirSync(join(NOTES, "channels"));
  writeFileSync(join(NOTES, "basics", "surprise.md"), "---\ntype: Concept\ntitle: Surprise\ndescription: How unexpected one outcome is.\n---\n\nAn outcome of probability $p$ carries $-\\log p$ of surprise.\n");
  writeFileSync(join(NOTES, "basics", "bit.md"), "---\ntype: Concept\ntitle: The bit\n# kept as written\ntags: [units]\n---\n\nOne fair coin toss, the unit of information.\n\n| tosses | bits |\n|---|---|\n| 1 | 1 |\n| 2 | 2 |\n");
  process.env.XDG_CONFIG_HOME = join(ROOT, "config");
  process.env.XDG_CACHE_HOME = join(ROOT, "cache");
  process.env.ISORITE_EMBED = "off"; // the browser tests are about the pages; the model has its own tests
  mkdirSync(join(ROOT, "config", "isorite"), { recursive: true });
  writeFileSync(join(ROOT, "config", "isorite", "config.toml"), `device = "browser01"\n\n[provider]\nname = "scripted"\nurl = "http://127.0.0.1:${PROVIDER_PORT}/v1"\n\n[tiers]\nlow = "scripted-low"\nmid = "scripted-mid"\nmax = "scripted-max"\n`);
  await provider();
  const { initStudyBase } = await import("../../packages/server/src/studybase.ts");
  const { serve } = await import("../../packages/server/src/serve.ts");
  initStudyBase(NOTES);
  await serve(NOTES, { port: PORT });
}
