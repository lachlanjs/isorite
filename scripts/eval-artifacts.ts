// node scripts/eval-artifacts.ts [--models a,b] [--only <case>] [--budget 3] [--scripted]: can a model build an
// artifact on the kit (plan-m23 §3.9)? Each case in eval/artifacts/cases.json is asked of each model through OpenRouter
// with the staged context (eval/artifacts/context/) and two tools, read_data and write_artifact. Every write is
// rendered in headless Chromium as isorite would show it (a sandboxed frame given its document through srcdoc, the
// kit inlined, no network), its sliders moved and buttons pressed, and checked without a judge; the errors and broken
// rules go back to the model as the tool's result, so it can fix them. Screenshots, each artifact and a report go to
// .eval/artifacts-<when>/, which git ignores. The key is OPENROUTER_API_KEY in the environment, never in a file here.

import { chromium, type Browser } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

interface Case { name: string; level: string; files: string[]; path: string; asked: string }
interface Msg { role: "system" | "user" | "assistant" | "tool"; content: string | null; tool_calls?: Call[]; tool_call_id?: string }
interface Call { id: string; type: "function"; function: { name: string; arguments: string } }
interface Render { rendered: boolean; errors: string[]; drawn: number; height: number; shots: string[] }
interface Result { model: string; case: Case; writes: number; reads: string[]; html?: string; render?: Render; broken: string[]; usd: number; seconds: number; note?: string }

const ROOT = join(import.meta.dirname, "..");
const EVAL = join(ROOT, "eval", "artifacts"), KIT = join(ROOT, "inspiration", "artifacts", "kit");
const arg = (name: string): string | undefined => { const at = process.argv.indexOf(name); return at < 0 ? undefined : process.argv[at + 1]; };
const MODELS = (arg("--models") ?? "anthropic/claude-sonnet-5.5,deepseek/deepseek-v4.1-flash,google/gemma-4-31b-it").split(",");
const only = arg("--only")?.split(","), budget = +(arg("--budget") ?? 3), scripted = process.argv.includes("--scripted");
// A model that thinks before it writes needs room for both: DeepSeek V4.1 Flash spent 16,000 tokens thinking and wrote
// nothing (the trial). Each model is given up to this, or its own limit where that's less.
const MAX_TOKENS = +(arg("--max-tokens") ?? 48000);
// Left to itself, DeepSeek V4.1 Flash thought past 48,000 tokens; with effort "low" it wrote (plan-m23 §9). --effort
// sends OpenRouter's reasoning effort to every model.
const EFFORT = arg("--effort");
const limits = new Map<string, number>();
const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY && !scripted) throw new Error("OPENROUTER_API_KEY is not set");

const cases = (JSON.parse(readFileSync(join(EVAL, "cases.json"), "utf8")) as Case[]).filter((c) => !only || only.includes(c.name));
const out = join(ROOT, ".eval", `artifacts-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`);
mkdirSync(out, { recursive: true });
const today = new Date().toISOString().slice(0, 10);

// The staged context: what an artifact is and the kit, then the worked example.
const example = readFileSync(join(ROOT, "inspiration", "artifacts", "entropy-lab.html"), "utf8");
const SYSTEM = `You are Iso, the agent in isorite, a knowledge base of Markdown notes. Today is ${today}. You are asked to build an artifact.

${readFileSync(join(EVAL, "context", "kit0.md"), "utf8")}
## Worked example: entropy-lab.html (it uses runs.csv)

\`\`\`html
${example}
\`\`\``;

const TOOLS = [
  { type: "function", function: { name: "read_data", description: "A data file's shape: columns and types, row count, the first rows, each numeric column's range and each text column's values.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "write_artifact", description: "Write the artifact. The result says whether it rendered, with any error and any broken rule to fix.", parameters: { type: "object", properties: {
    path: { type: "string", description: "Where it goes, ending .html" }, title: { type: "string" }, description: { type: "string", description: "One sentence" },
    uses: { type: "array", items: { type: "string" }, description: "Every data file the artifact reads" }, html: { type: "string", description: "The whole file" } }, required: ["path", "title", "description", "uses", "html"] } } },
];

// Data: the rows of a CSV, and its shape as read_data gives it.
const dataText = (f: string) => readFileSync(join(EVAL, "data", f), "utf8");
function rows(text: string): Record<string, string | number>[] {
  const [head, ...lines] = text.trim().split(/\r?\n/), cols = head.split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v !== "" && !isNaN(+v) ? +v : v])));
}
function shape(path: string): string {
  const all = rows(dataText(path)), cols = Object.keys(all[0]);
  const lines = [`${path}: ${all.length} rows, ${cols.length} columns`];
  for (const c of cols) {
    const vs = all.map((r) => r[c]);
    if (vs.every((v) => typeof v === "number")) { const ns = vs as number[]; lines.push(`- ${c}: number, ${Math.min(...ns)} to ${Math.max(...ns)}`); }
    else { const set = [...new Set(vs)]; lines.push(`- ${c}: text, ${set.length} values: ${set.slice(0, 12).join(", ")}${set.length > 12 ? ", …" : ""}`); }
  }
  lines.push("First rows:", [cols.join(","), ...dataText(path).trim().split("\n").slice(1, 6)].join("\n"));
  return lines.join("\n");
}

// The rules of kit0.md that can be checked from the file alone.
function rules(html: string, uses: string[], given: string[]): string[] {
  const broken: string[] = [], body = html.replace(/<link[^>]*kit\/[^>]*>/g, "").replace(/<script src="kit\/kit\.js"><\/script>/, "");
  for (const need of ['href="kit/isorite.css"', 'href="kit/plain.css"', 'href="kit/kit.css"', '<script src="kit/kit.js"></script>', 'name="isorite:uses"', 'name="description"'])
    if (!html.includes(need)) broken.push(`rule 1: the head is missing ${need}`);
  const manifest = (html.match(/<meta name="isorite:uses" content="([^"]*)"/)?.[1] ?? "").split(/[\s,]+/).filter(Boolean);
  for (const f of manifest) if (!given.includes(f)) broken.push(`rule 2: ${f} is in isorite:uses but isn't a file you were given`);
  for (const m of body.matchAll(/iso\.(?:data|text)\(\s*["'`]([^"'`]+)["'`]/g)) if (!manifest.includes(m[1])) broken.push(`rule 2: the script reads ${m[1]}, which isn't in isorite:uses`);
  if ([...manifest].sort().join() !== [...uses].sort().join()) broken.push(`rule 2: isorite:uses (${manifest.join(" ") || "none"}) and write_artifact's uses (${uses.join(" ") || "none"}) differ`);
  const colour = body.match(/#[0-9a-fA-F]{3,8}\b(?![-\w])|\b(?:rgba?|hsla?)\(\s*\d|\b(?:fill|stroke|fillStyle|strokeStyle|color|background|shadowColor)\s*[:=]\s*["'`]?(?:white|black|red|blue|green|gray|grey|orange|yellow|purple)\b/);
  if (colour) broken.push(`rule 3: a colour of its own (${colour[0].trim()}); use the tokens`);
  const font = body.match(/font-family\s*:[^;"]*|font\s*[:=]\s*["'`]?[^;"'`]*(?<![.\w-])(?:sans-serif|serif|monospace|Arial|Helvetica|system-ui)\b/i);
  if (font && !/var\(--font/.test(font[0])) broken.push(`rule 4: a font of its own (${font[0].slice(0, 60)})`);
  if (/border-radius/.test(body)) broken.push("rule 4: border-radius");
  if (/https?:\/\//.test(body.replace(/<!--[\s\S]*?-->/g, "").replace(/http:\/\/www\.w3\.org\/[\w/]+/g, ""))) broken.push("rule 5: a URL");
  if (/<script[^>]+src=/.test(body)) broken.push("rule 5: a <script src> other than the kit");
  if (/\bfetch\(/.test(body)) broken.push("rule 5: fetch");
  if (html.length > 200_000) broken.push(`rule 6: ${Math.round(html.length / 1024)} kB, over 200 kB`);
  if (/\b(?:drag to|click (?:here|to|on)|tap to|scroll to|hover (?:to|over))\b/i.test(body.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]*>/g, " "))) broken.push("rule 7: text that explains how to use it");
  return broken;
}

// Shown as isorite shows it: the kit inlined, the CSP, a sandboxed frame given srcdoc, data over the bridge.
let browser: Browser | undefined;
const kitFile = (f: string) => readFileSync(join(KIT, f), "utf8").replace(/<\/(script|style)/gi, "<\\/$1");
function assemble(html: string): string {
  const css = (f: string, look?: string) => `<style${look ? ` data-look="${look}"` : ""}>\n${kitFile(f)}\n</style>`;
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:">`;
  return html
    .replace(/<link[^>]*href="kit\/isorite\.css"[^>]*>/, () => css("isorite.css", "isorite"))
    .replace(/<link[^>]*href="kit\/plain\.css"[^>]*>/, () => css("plain.css", "plain"))
    .replace(/<link[^>]*href="kit\/kit\.css"[^>]*>/, () => css("kit.css"))
    .replace(/<script src="kit\/kit\.js"><\/script>/, () => `<script>\n${kitFile("kit.js")}\n</script>`)
    .replace(/<head[^>]*>/i, (h) => `${h}\n${csp}`);
}
async function render(html: string, given: string[], stem: string): Promise<Render> {
  browser ??= await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1140, height: 900 } });
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  const manifest = (html.match(/<meta name="isorite:uses" content="([^"]*)"/)?.[1] ?? "").split(/[\s,]+/).filter(Boolean);
  const files = Object.fromEntries(given.map((f) => [f, dataText(f)]));
  try {
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#0b1424"><iframe id="f" sandbox="allow-scripts" style="display:block;width:1140px;height:900px;border:0"></iframe></body></html>`);
    await page.evaluate(({ doc, files, manifest }) => {
      const f = document.getElementById("f") as HTMLIFrameElement, w = window as unknown as { said: string[]; ready: boolean };
      w.said = []; w.ready = false;
      const tell = (m: object) => f.contentWindow!.postMessage({ isorite: 0, ...m }, "*");
      addEventListener("message", (e) => {
        const m = e.data;
        if (e.source !== f.contentWindow || !m || m.isorite !== 0) return;
        if (m.type === "ready") { w.ready = true; tell({ type: "ground", ground: "lapis" }); tell({ type: "look", look: "isorite" }); }
        else if (m.type === "file") {
          if (!manifest.includes(m.path)) tell({ type: "reply", id: m.id, error: `${m.path} is not in the artifact's manifest (isorite:uses)` });
          else if (!(m.path in files)) tell({ type: "reply", id: m.id, error: `${m.path}: no such file` });
          else tell({ type: "reply", id: m.id, text: files[m.path] });
        }
        else if (m.type === "height") f.style.height = `${Math.min(6000, Math.ceil(m.height) + 4)}px`;
        else if (m.type === "error") w.said.push(m.message);
      });
      f.srcdoc = doc;
    }, { doc: assemble(html), files, manifest });
    await page.waitForTimeout(2500);
    const ready = await page.evaluate(() => (window as unknown as { ready: boolean }).ready);
    const frame = page.frames().find((fr) => fr !== page.mainFrame());
    const height = await page.evaluate(() => document.getElementById("f")!.offsetHeight);
    await page.setViewportSize({ width: 1140, height: Math.max(600, height) });
    const shots = [`${stem}-lapis.png`];
    await page.screenshot({ path: join(out, shots[0]), fullPage: true });
    // What it drew: SVG marks, and canvases that aren't one flat colour.
    const drawn = frame ? await frame.evaluate(() => {
      let n = document.querySelectorAll("svg path, svg line, svg circle, svg rect, svg polyline, svg polygon, svg text").length;
      for (const c of document.querySelectorAll("canvas")) {
        try { const d = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data; if (d && d.some((v, i) => v !== d[i % 4])) n += 100; } catch { n += 100; }
      }
      return n;
    }) : 0;
    // Touch everything: every slider to three quarters, every button pressed, then the light ground.
    if (frame) await frame.evaluate(async () => {
      for (const r of document.querySelectorAll<HTMLInputElement>("input[type=range]")) { r.value = String(+r.min + (+r.max - +r.min) * 0.75); r.dispatchEvent(new Event("input", { bubbles: true })); r.dispatchEvent(new Event("change", { bubbles: true })); }
      for (const s of document.querySelectorAll<HTMLSelectElement>("select")) { if (s.options.length > 1) { s.selectedIndex = 1; s.dispatchEvent(new Event("change", { bubbles: true })); } }
      for (const b of document.querySelectorAll<HTMLElement>("button:not(.iso-note), input[type=checkbox]")) b.click();
      await new Promise((r) => setTimeout(r, 400));
      const c = document.querySelector("canvas");
      if (c) { const r = c.getBoundingClientRect(), at = (t: string, x: number) => c.dispatchEvent(new PointerEvent(t, { clientX: r.left + x, clientY: r.top + r.height / 2, bubbles: true, pointerId: 1 }));
        at("pointerdown", r.width / 2); at("pointermove", r.width / 2 + 60); at("pointerup", r.width / 2 + 60); c.dispatchEvent(new MouseEvent("click", { clientX: r.left + r.width / 3, clientY: r.top + r.height / 3, bubbles: true })); }
    });
    await page.evaluate(() => { const f = document.getElementById("f") as HTMLIFrameElement; document.body.style.background = "#eef0f2"; f.contentWindow!.postMessage({ isorite: 0, type: "ground", ground: "quartz" }, "*"); });
    await page.waitForTimeout(900);
    shots.push(`${stem}-quartz.png`);
    await page.screenshot({ path: join(out, shots[1]), fullPage: true });
    const said = await page.evaluate(() => (window as unknown as { said: string[] }).said);
    return { rendered: ready, errors: [...new Set([...said, ...errors])].slice(0, 12), drawn, height, shots };
  } finally { await page.close(); }
}

// One model on one case: the conversation, with the tools answered here.
let spent = 0;
/** Models that used their whole budget thinking and wrote nothing, at least once. */
const cut = new Set<string>();
async function call(model: string, messages: Msg[]): Promise<{ message: Msg; usd: number }> {
  if (scripted) {
    const done = messages.some((m) => m.role === "tool" && m.content?.startsWith("Written"));
    const html = example.replace(/runs\.csv/g, "timesteps.csv");
    return { usd: 0, message: done ? { role: "assistant", content: "Done." } : { role: "assistant", content: null, tool_calls: [{ id: "1", type: "function", function: { name: "write_artifact", arguments: JSON.stringify({ path: "x.html", title: "t", description: "d", uses: ["timesteps.csv"], html }) } }] } };
  }
  for (let attempt = 0; ; attempt++) {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json", "x-title": "isorite artifact eval" },
      body: JSON.stringify({ model, messages, tools: TOOLS, max_tokens: Math.min(MAX_TOKENS, limits.get(model) ?? MAX_TOKENS), usage: { include: true }, ...(EFFORT ? { reasoning: { effort: EFFORT } } : {}) }),
      signal: AbortSignal.timeout(15 * 60_000),
    });
    const j = await r.json() as { choices?: { message: Msg; finish_reason?: string }[]; usage?: { cost?: number }; error?: { message: string } };
    if (j.choices?.[0]) {
      const usd = j.usage?.cost ?? 0, c = j.choices[0];
      spent += usd;
      if (c.finish_reason === "length" && !c.message.content && !c.message.tool_calls?.length) cut.add(model);
      return { message: c.message, usd };
    }
    if (attempt >= 2) throw new Error(j.error?.message ?? `HTTP ${r.status}`);
    await new Promise((res) => setTimeout(res, 4000 * (attempt + 1)));
  }
}
async function attempt(model: string, c: Case): Promise<Result> {
  const t0 = Date.now(), res: Result = { model, case: c, writes: 0, reads: [], broken: [], usd: 0, seconds: 0 };
  const given = c.files.length ? `Data files beside it: ${c.files.join(", ")}.` : "It uses no data file.";
  const messages: Msg[] = [{ role: "system", content: SYSTEM }, { role: "user", content: `${c.asked}\n\nWrite it to ${c.path}. ${given}` }];
  const stem = `${model.split("/")[1]}--${c.name}`;
  for (let turn = 0; turn < 8 && res.writes < 3; turn++) {
    if (spent > budget) { res.note = "stopped: over budget"; break; }
    const { message, usd } = await call(model, messages);
    res.usd += usd;
    messages.push({ role: "assistant", content: message.content ?? null, ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}) });
    if (!message.tool_calls?.length) {
      // No tool called: take an html block from the reply, as Iso would not (it would be told to call the tool).
      if (!res.html) { const m = message.content?.match(/```html\n([\s\S]*?)```/); if (m) { res.note = "wrote the file in its reply, not through write_artifact"; res.html = m[1]; res.render = await render(m[1], c.files, `${stem}-${res.writes}`); res.broken = rules(m[1], [], c.files); } }
      break;
    }
    for (const tc of message.tool_calls) {
      let a: Record<string, unknown>, said: string;
      try { a = JSON.parse(tc.function.arguments || "{}"); } catch (e) { messages.push({ role: "tool", tool_call_id: tc.id, content: `The arguments weren't valid JSON (${(e as Error).message}). Call it again.` }); continue; }
      if (tc.function.name === "read_data") {
        const p = String(a.path ?? "").replace(/^\.?\//, "").split("/").pop()!;
        res.reads.push(p);
        said = c.files.includes(p) ? shape(p) : `${a.path}: no such file. The files are: ${c.files.join(", ") || "none"}.`;
      } else if (tc.function.name === "write_artifact") {
        const html = String(a.html ?? ""), uses = Array.isArray(a.uses) ? a.uses.map(String) : [];
        res.writes++; res.html = html;
        res.broken = rules(html, uses, c.files);
        res.render = await render(html, c.files, `${stem}-${res.writes}`);
        writeFileSync(join(out, `${stem}-${res.writes}.html`), html);
        const problems = [...res.broken, ...(!res.render.rendered ? ["it didn't start: kit.js never said it was ready (is the head right?)"] : []),
          ...res.render.errors.map((e) => `error: ${e}`), ...(res.render.drawn === 0 ? ["nothing was drawn: no SVG marks and no canvas with anything on it"] : [])];
        said = problems.length ? `Written to ${a.path}, but:\n${problems.map((p) => `- ${p}`).join("\n")}\nFix these and call write_artifact again with the whole file.` : `Written to ${a.path}. It rendered with no error, and it drew. Done unless you see something to improve.`;
      } else said = `There's no tool ${tc.function.name}.`;
      messages.push({ role: "tool", tool_call_id: tc.id, content: said });
    }
  }
  res.seconds = Math.round((Date.now() - t0) / 1000);
  writeFileSync(join(out, `${stem}.json`), JSON.stringify(messages.slice(1), null, 1));
  return res;
}

if (!scripted) {
  const all = (await (await fetch("https://openrouter.ai/api/v1/models")).json() as { data: { id: string; top_provider?: { max_completion_tokens?: number } }[] }).data;
  for (const m of all) if (m.top_provider?.max_completion_tokens) limits.set(m.id, m.top_provider.max_completion_tokens);
}
// --kit 1 (the default): Iso itself is asked, through the engine, in write mode, on a fresh copy of the N-body example
// base with the case's data beside where it's asked to write: its prompt, its tools (artifact_recipe, read_data,
// write_artifact with its checks and its run unseen), and its loop (room to think, effort low when it wrote nothing).
// What it wrote is then rendered for the screenshots and checked as above. --kit 0 is the trial: the model asked
// directly with kit 0's context.
const KIT1 = (arg("--kit") ?? "1") === "1";
const BUILT_KIT = join(ROOT, "app", "build", "kit");
async function attemptIso(model: string, c: Case): Promise<Result> {
  const { mkdtempSync, rmSync, cpSync, readdirSync: ls } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { Engine, MemorySecrets, OPENROUTER, KEY, systemClock } = await import("@isorite/engine");
  const { writeExample } = await import("../packages/example/src/node.ts");
  const { NodeFiles } = await import("../packages/server/src/nodefiles.ts");
  const { runArtifact } = await import("../packages/server/src/serve.ts");
  const { assemble, checkArtifact, columnsOf, parseData, KIT_FILES } = await import("@isorite/kit");
  const t0 = Date.now(), res: Result = { model, case: c, writes: 0, reads: [], broken: [], usd: 0, seconds: 0 };
  const root = mkdtempSync(join(tmpdir(), "isorite-artifacts-"));
  try {
    const { notes } = await writeExample(join(root, "base"));
    const dir = dirname(c.path);
    mkdirSync(join(notes, dir), { recursive: true });
    for (const f of c.files) cpSync(join(EVAL, "data", f), join(notes, dir, f));
    mkdirSync(join(notes, ".isorite"), { recursive: true });
    const engine = await Engine.open({
      notes: new NodeFiles(notes), own: new NodeFiles(join(notes, ".isorite")), clock: systemClock, device: "eval01", name: "nbody-notes",
      http: { fetch }, secrets: new MemorySecrets({ [KEY]: KEY_VALUE }), provider: { ...OPENROUTER, tiers: { low: model, mid: model, max: model } },
      renderArtifact: (path, html) => runArtifact(notes, path, html),
    });
    const given = c.files.length ? `Data files beside it: ${c.files.join(", ")}.` : "It uses no data file.";
    const { conversation, turn } = await engine.converse({ mode: "write", asked: `${c.asked}\n\nWrite it to ${c.path}. ${given}`, tier: "mid", given: [] });
    let cost = 0, failed = "";
    await new Promise<void>((done) => {
      const off = engine.events((e) => {
        if (!("request" in e) || e.request !== turn) return;
        if (e.type === "iso-done") { cost = (e as { cost?: { usd: number } }).cost?.usd ?? 0; off(); done(); }
        else if (e.type === "iso-failed" || e.type === "iso-stopped") { failed = (e as { message?: string }).message ?? e.type; off(); done(); }
      });
    });
    res.usd = cost; spent += cost;
    const t = (await engine.conversation(conversation))!.turns[0]!;
    res.writes = t.items.filter((i) => i.kind === "change" && i.note.endsWith(".html")).length;
    res.reads = t.items.flatMap((i) => (i.kind === "look" && i.step.tool === "read_data" ? [String((i.step as { said?: string }).said ?? "")] : []));
    if (failed) res.note = `failed: ${failed.slice(0, 200)}`;
    writeFileSync(join(out, `${model.split("/")[1]}--${c.name}.json`), JSON.stringify(t, null, 1));
    const written = ls(join(notes, dir)).filter((f) => f.endsWith(".html")).map((f) => join(dir, f));
    const path = written.includes(c.path) ? c.path : written[0];
    if (path) {
      const html = readFileSync(join(notes, path), "utf8");
      res.html = html;
      writeFileSync(join(out, `${model.split("/")[1]}--${c.name}-${res.writes}.html`), html);
      const columns = Object.fromEntries(c.files.filter((f) => f.endsWith(".csv")).map((f) => [f, columnsOf(parseData(f, dataText(f)))]));
      res.broken = checkArtifact(html, { files: c.files, columns }).filter((b) => b.level === "error").map((b) => `rule ${b.rule}: ${b.message}`);
      const kit = Object.fromEntries(KIT_FILES.map((f) => [f, readFileSync(join(BUILT_KIT, f), "utf8")])) as never;
      const stem = `${model.split("/")[1]}--${c.name}-${res.writes}`, shots: string[] = [];
      const { renderArtifact, findBrowser } = await import("../packages/server/src/render.ts");
      const read = async (rel: string) => { try { return rel.endsWith(".csv") ? readFileSync(join(notes, dir, rel), "utf8") : new Uint8Array(readFileSync(join(notes, dir, rel))); } catch { return null; } };
      let first: Render | undefined;
      for (const ground of ["lapis", "quartz"]) {
        const got = await renderArtifact(assemble(html, kit, { ground }), (html.match(/<meta name="isorite:uses" content="([^"]*)"/)?.[1] ?? "").split(/[\s,]+/).filter(Boolean), read, { executable: findBrowser()!, ground, screenshot: true });
        if (got.screenshot) { writeFileSync(join(out, `${stem}-${ground}.png`), got.screenshot); shots.push(`${stem}-${ground}.png`); }
        first ??= { rendered: got.rendered, errors: got.errors, drawn: got.drawn, height: got.height, shots };
      }
      res.render = first;
    } else res.note ??= "wrote no artifact";
  } finally { rmSync(root, { recursive: true, force: true }); }
  res.seconds = Math.round((Date.now() - t0) / 1000);
  return res;
}
const KEY_VALUE = KEY ?? "";

const results: Result[] = [];
for (const model of MODELS) {
  // The models in parallel would be quicker, but one at a time keeps the spend checkable between cases.
  for (const c of cases) {
    if (spent > budget) break;
    process.stdout.write(`${model} ${c.name} … `);
    try { const r = await (KIT1 ? attemptIso(model, c) : attempt(model, c)); results.push(r); console.log(`${r.writes} writes, ${r.broken.length} rules, ${r.render?.errors.length ?? "-"} errors, drew ${r.render?.drawn ?? 0}, $${r.usd.toFixed(3)} (total $${spent.toFixed(2)})`); }
    catch (e) { console.log(`failed: ${(e as Error).message}`); results.push({ model, case: c, writes: 0, reads: [], broken: [], usd: 0, seconds: 0, note: `failed: ${(e as Error).message}` }); }
  }
}
await browser?.close();
await (await import("../packages/server/src/render.ts")).closeBrowser();

const ok = (r: Result) => !!r.render?.rendered && !r.render.errors.length && !r.broken.length && r.render.drawn > 0;
const lines = [`# Artifact eval, ${today}`, "", `Spent $${spent.toFixed(2)} of $${budget}.${cut.size ? ` Used the whole output budget thinking, at least once: ${[...cut].join(", ")}.` : ""}`, "", "| model | case | level | passes | writes | read_data | rules broken | errors | drawn | $ | s |", "|---|---|---|---|---|---|---|---|---|---|---|"];
for (const r of results) lines.push(`| ${r.model.split("/")[1]} | ${r.case.name} | ${r.case.level} | ${ok(r) ? "yes" : "no"} | ${r.writes} | ${r.reads.join(" ") || "-"} | ${r.broken.join("; ") || "-"} | ${r.render?.errors.join("; ").slice(0, 160) || "-"} | ${r.render?.drawn ?? 0} | ${r.usd.toFixed(3)} | ${r.seconds} |${r.note ? ` ${r.note}` : ""}`);
writeFileSync(join(out, "report.md"), lines.join("\n") + "\n");
// A page of the screenshots, by case, to judge the quality by eye.
const gallery = cases.map((c) => `<h2>${c.name} <small>${c.level}</small></h2><p>${c.asked}</p><div class="row">${results.filter((r) => r.case === c).map((r) => `<figure><figcaption>${r.model.split("/")[1]} ${ok(r) ? "✓" : "✗"} <a href="${r.model.split("/")[1]}--${c.name}-${r.writes}.html">html</a></figcaption>${(r.render?.shots ?? []).map((s) => `<a href="${s}"><img src="${s}" loading="lazy"></a>`).join("")}</figure>`).join("")}</div>`).join("\n");
writeFileSync(join(out, "index.html"), `<!doctype html><meta charset="utf-8"><title>Artifact eval</title><style>body{font:14px system-ui;margin:20px;background:#111;color:#ddd}a{color:#9cf}.row{display:flex;gap:12px;overflow-x:auto}figure{margin:0;flex:0 0 420px}img{width:420px;display:block;margin-bottom:6px;border:1px solid #333}</style><h1>Artifact eval</h1>${gallery}`);
console.log(`\n${lines.slice(2).join("\n")}\n\n${out}`);
