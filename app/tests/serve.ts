// The server the browser tests run against: a small base made fresh in a
// temporary folder, with its .isorite/, served on its own port. Nothing of
// yours is read or written: the device's configuration is kept there too.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const PORT = 4799;
export const ROOT = join(tmpdir(), "isorite-browser-tests");
export const NOTES = join(ROOT, "information-theory");
/** isorite's own files for the base (format 2). */
export const STUDY = join(NOTES, ".isorite");

export const PROVIDER_PORT = 4798;
export const REPLY = "It is measured in **bits**, as [Surprise](/basics/surprise.md) is.\n\n$$\nH(X) \\le \\log_2 n\n$$";

/** A provider that speaks the chat completions protocol (and makes keys by signing in) and says what the prompt's words call for:
 *  "look" looks a note up first, "slow" never finishes, "fail" refuses; anything else is answered with REPLY. */
async function provider(): Promise<void> {
  const { createServer } = await import("node:http");
  const { createHash } = await import("node:crypto");
  const codes = new Map<string, string>();
  createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    // Signing in for a key, as OpenRouter's OAuth with PKCE does: the sign-in page sends you straight back with a
    // code, which is exchanged for a key only with the verifier its challenge was made from.
    const at = new URL(req.url ?? "/", `http://127.0.0.1:${PROVIDER_PORT}`);
    if (at.pathname === "/auth") {
      const code = `code-${codes.size + 1}`, back = new URL(at.searchParams.get("callback_url")!);
      codes.set(code, at.searchParams.get("code_challenge")!);
      back.searchParams.set("code", code);
      back.searchParams.set("state", at.searchParams.get("state")!);
      res.writeHead(302, { location: back.href }).end();
      return;
    }
    if (at.pathname === "/v1/auth/keys") {
      const { code, code_verifier } = JSON.parse(body) as { code: string; code_verifier: string };
      const ok = codes.get(code) === createHash("sha256").update(code_verifier).digest("base64url");
      codes.delete(code);
      res.writeHead(ok ? 200 : 403, { "content-type": "application/json" }).end(JSON.stringify(ok ? { key: `sk-scripted-made-${code}` } : { error: { message: "Invalid code or code_verifier" } }));
      return;
    }
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
    } else if (/\bunderstand (\S+)/.test(asked) && !looked) {
      // Understand mode (M10): "understand <id>" writes Iso's reading of it.
      const id = /\bunderstand (\S+)/.exec(asked)![1]!;
      const call = { name: "write_understanding", arguments: JSON.stringify({ id, reading: "You can say what it measures, and why." }) };
      data({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: call }] } }] });
    } else if (/\bedit (\S+)/.test(asked) && !looked) {
      // Write mode (M10): "edit <id>" changes its "Plain text." into Iso's words; "move <id> to <id>" asks first.
      const id = /\bedit (\S+)/.exec(asked)![1]!;
      data({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "edit_note", arguments: JSON.stringify({ id, old: "Plain text.", new: "Plain text, and Iso's words." }) } }] } }] });
    } else if (/\bmove (\S+) to (\S+)/.test(asked) && !looked) {
      const [, id, to] = /\bmove (\S+) to (\S+)/.exec(asked)!;
      data({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "move_note", arguments: JSON.stringify({ id, to }) } }] } }] });
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
  // For the Atlas: a folder of three notes, each requiring the one before, the first requiring one of basics.
  mkdirSync(join(NOTES, "coding"));
  const coding = (title: string, requires: string) => `---\ntype: Concept\ntitle: ${title}\n---\n\nIt rests on [this](/${requires}.md "requires").\n`;
  writeFileSync(join(NOTES, "coding", "source-coding.md"), coding("Source coding", "basics/surprise"));
  writeFileSync(join(NOTES, "coding", "kraft-inequality.md"), coding("Kraft inequality", "coding/source-coding"));
  // The last of them also joined by weaker links: "uses", which the map draws lighter, and "see also", which it does not draw.
  writeFileSync(join(NOTES, "coding", "huffman-codes.md"), coding("Huffman codes", "coding/kraft-inequality") + `\nIt counts in [bits](/basics/bit.md "uses"). See also [surprise](/basics/surprise.md "see also").\n`);
  process.env.XDG_CONFIG_HOME = join(ROOT, "config");
  process.env.XDG_CACHE_HOME = join(ROOT, "cache");
  process.env.ISORITE_EMBED = "off"; // the browser tests are about the pages; the model has its own tests
  mkdirSync(join(ROOT, "config", "isorite"), { recursive: true });
  writeFileSync(join(ROOT, "config", "isorite", "config.toml"), `device = "browser01"\n\n[provider]\nname = "scripted"\nurl = "http://127.0.0.1:${PROVIDER_PORT}/v1"\nauth = "http://127.0.0.1:${PROVIDER_PORT}/auth"\n\n[tiers]\nlow = "scripted-low"\nmid = "scripted-mid"\nmax = "scripted-max"\n`);
  await provider();
  const { serve } = await import("../../packages/server/src/serve.ts");
  await serve(NOTES, { port: PORT });
}
