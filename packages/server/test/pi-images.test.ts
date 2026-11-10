// Images given the agent from the pane's box: sent with the turn as image blocks only where the model takes them; kept by
// content apart from the session, so a saved session is small and a resumed one still has them; and a summary of the
// earlier conversation is written without them. The scripted model says what it was sent (scripted.ts).

import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve as nodeServe } from "@hono/node-server";
import { afterAll, expect, test } from "vitest";
import { createModels, fauxAssistantMessage, fauxProvider, fauxText } from "@earendil-works/pi-ai";
import { writeExample } from "@isorite/example/node";
import type { TerminalItem, TerminalView } from "@isorite/engine";
import { TOKEN_HEADER, createApp } from "../src/http.ts";
import { PiHost } from "../src/pi/host.ts";
import { FileImages, MemoryImages, checked } from "../src/pi/images.ts";
import { modelFor } from "../src/pi/index.ts";
import { FileStore } from "../src/pi/store.ts";
import { locate, openEngine } from "../src/serve.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-pi-images-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: 40 }, (_, i) => i)]);
const ENV = { ISORITE_SCRIPTED: "1" };
const pending = (host: PiHost): Promise<TerminalView> => new Promise((done) => { const off = host.listen((v) => { if (!v.busy && v.turns.at(-1)?.state !== "running") { off(); done(v); } }); });
const text = (v: TerminalView) => (v.turns.at(-1)!.items.filter((i): i is Extract<TerminalItem, { kind: "text" }> => i.kind === "text").map((i) => i.text).join(""));

async function scripted(model: string, extra: ConstructorParameters<typeof PiHost>[0] extends infer O ? Partial<O> : never = {}) {
  const base = await writeExample(join(root, `base-${Math.random().toString(36).slice(2)}`));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const { chosen, streamFn } = await modelFor("scripted", model, ENV);
  return { host: new PiHost({ api, model: chosen, streamFn, ...extra }), api, notes: base.notes };
}

test("an image is told by its bytes and kept once by its content", async () => {
  expect(checked(PNG).type).toBe("image/png");
  expect(() => checked(new TextEncoder().encode("<svg/>"))).toThrow(/not a png/);
  expect(() => checked(new Uint8Array(5_000_001).fill(0))).toThrow();
  const big = new Uint8Array(5_000_001); big.set(PNG);
  expect(() => checked(big)).toThrow(/5 MB/);
  const store = new MemoryImages(), a = await store.put(PNG), b = await store.put(PNG);
  expect(a).toEqual(b);
  expect((await store.get(a.id))?.type).toBe("image/png");
  const files = new FileImages(join(root, "kept-images"));
  expect(await files.get("../../etc/passwd")).toBeNull();
  const kept = await files.put(PNG);
  expect([...(await files.get(kept.id))!.bytes]).toEqual([...PNG]);
});

test("a turn with an image sends it to the model as an image block, shown in the turn by its id", async () => {
  const { host } = await scripted("scripted");
  const { id } = await host.keepImage(PNG);
  const done = pending(host);
  await host.prompt("what is in this?", [id]);
  const view = await done;
  expect(view.images).toBe(true);
  expect(view.turns[0]!.images).toEqual([id]);
  expect(text(view)).toContain(`Saw 1 image: image/png, ${PNG.length} bytes.`);
  expect((await host.image(id))?.type).toBe("image/png");
});

test("a model that takes no images is not sent one: the turn says it does not", async () => {
  const { host } = await scripted("scripted-text");
  const { id } = await host.keepImage(PNG);
  await expect(host.prompt("what is in this?", [id])).rejects.toThrow(/does not take images/);
  expect(host.view().turns).toEqual([]);
  expect(host.view().images).toBe(false);
  // The same turn without it goes.
  const done = pending(host);
  await host.prompt("what is in this?");
  expect(text(await done)).not.toContain("Saw");
});

test("a session is kept without the image's bytes, and a resumed one has them again for the model", async () => {
  const dir = join(root, "sessions"), store = new FileStore(dir), images = new FileImages(join(dir, "images"));
  const faux = fauxProvider(), models = createModels();
  models.setProvider(faux.provider);
  const base = await writeExample(join(root, "base-resume"));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const make = () => new PiHost({ api, model: faux.getModel(), streamFn: models.streamSimple.bind(models), store, images });
  const first = make();
  faux.setResponses([fauxAssistantMessage([fauxText("A coin.")])]);
  const { id } = await first.keepImage(PNG);
  let done = pending(first);
  await first.prompt("what is it?", [id]);
  await done;
  await expect.poll(() => readdirSync(dir).filter((n) => n.endsWith(".json")).length).toBe(1);
  const record = readFileSync(join(dir, readdirSync(dir).find((n) => n.endsWith(".json"))!), "utf8");
  expect(record).toContain(id);
  expect(record).not.toContain(Buffer.from(PNG).toString("base64"));
  // After a restart: the turn still names it, and the next request carries the bytes.
  const second = make();
  await second.resume();
  expect(second.view().turns[0]!.images).toEqual([id]);
  let sent: unknown;
  faux.setResponses([((context: { messages: { role: string; content: unknown }[] }) => { sent = context.messages.find((m) => m.role === "user")?.content; return fauxAssistantMessage([fauxText("Still a coin.")]); }) as never]);
  done = pending(second);
  await second.prompt("and now?");
  await done;
  expect(sent).toContainEqual({ type: "image", data: Buffer.from(PNG).toString("base64"), mimeType: "image/png", ref: id });
});

test("an image the model changed to cannot see becomes a line, not a failed turn", async () => {
  const faux = fauxProvider(), models = createModels();
  models.setProvider(faux.provider);
  const base = await writeExample(join(root, "base-gone"));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const images = new MemoryImages();
  const host = new PiHost({ api, model: faux.getModel(), streamFn: models.streamSimple.bind(models), images });
  const { id } = await host.keepImage(PNG);
  let sent = "";
  const respond = (context: { messages: { content: unknown }[] }) => { sent = JSON.stringify(context.messages); return fauxAssistantMessage([fauxText("Ok.")]); };
  faux.setResponses([respond as never, respond as never]);
  let done = pending(host);
  await host.prompt("look", [id]);
  await done;
  expect(sent).toContain('"type":"image"');
  host.use({ ...faux.getModel(), input: ["text"] }, models.streamSimple.bind(models));
  done = pending(host);
  await host.prompt("and again");
  await done;
  expect(sent).not.toContain('"type":"image"');
  expect(sent).toContain("which this model cannot see");
});

test("a summary of the earlier conversation is written from it without the pictures", async () => {
  const faux = fauxProvider(), models = createModels();
  models.setProvider(faux.provider);
  const base = await writeExample(join(root, "base-compact"));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  const host = new PiHost({ api, model: { ...faux.getModel(), contextWindow: 3600 }, streamFn: models.streamSimple.bind(models), compaction: { reserveTokens: 200, keepRecentTokens: 500 } });
  let asked = "";
  const respond = (context: { messages: { content: unknown }[] }) => {
    const last = JSON.stringify(context.messages.at(-1)?.content);
    if (last.includes("<conversation>")) { asked = last; return fauxAssistantMessage([fauxText("THE SUMMARY")]); }
    return fauxAssistantMessage([fauxText("Noted.")]);
  };
  faux.setResponses(Array.from({ length: 30 }, () => respond) as never);
  const { id } = await host.keepImage(PNG);
  const long = (tag: string) => `${tag} ${"The integrator advances the state by one small step. ".repeat(30)}`;
  let done = pending(host);
  await host.prompt(long("Question 1."), [id]);
  await done;
  let compaction: Extract<TerminalItem, { kind: "compaction" }> | undefined;
  for (let n = 2; n < 9 && !compaction; n++) {
    done = pending(host);
    await host.prompt(long(`Question ${n}.`));
    compaction = (await done).turns.at(-1)!.items.find((i): i is Extract<TerminalItem, { kind: "compaction" }> => i.kind === "compaction");
  }
  expect(compaction).toMatchObject({ state: "done" });
  expect(asked).toContain("an image the person attached");
  expect(asked).not.toContain(Buffer.from(PNG).toString("base64"));
});

test("the pane's routes: an image is kept from this machine by its bytes, and given back by its id", async () => {
  const { host, api } = await scripted("scripted");
  const web = join(root, "web");
  const app = createApp({ api, token: "t", loopback: true, web, terminal: host });
  const server = nodeServe({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 });
  await new Promise((ok) => server.once("listening", ok));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const post = (body: Uint8Array | string, headers: Record<string, string> = {}) => fetch(url + "/api/terminal/image", { method: "POST", headers: { Origin: url, [TOKEN_HEADER]: "t", ...headers }, body });
    const kept = await post(PNG);
    expect(kept.status).toBe(200);
    const { id, type } = await kept.json() as { id: string; type: string };
    expect(type).toBe("image/png");
    const got = await fetch(`${url}/api/terminal/image?id=${id}`);
    expect([got.status, got.headers.get("content-type")]).toEqual([200, "image/png"]);
    expect([...new Uint8Array(await got.arrayBuffer())]).toEqual([...PNG]);
    expect((await post(new TextEncoder().encode("<script>x</script>"))).status).toBe(415);
    expect((await post(new Uint8Array(5_000_001))).status).toBe(413);
    expect((await post(PNG, { [TOKEN_HEADER]: "bad" })).status).toBe(403);
    expect((await fetch(`${url}/api/terminal/image?id=../../etc/passwd`)).status).toBe(404);
    // A prompt names images by id; a made-up id is refused by its shape.
    const prompt = (images: string[]) => fetch(url + "/api/terminal/prompt", { method: "POST", headers: { Origin: url, [TOKEN_HEADER]: "t", "Content-Type": "application/json" }, body: JSON.stringify({ asked: "see", given: [], images }) });
    expect((await prompt(["nope"])).status).toBe(400);
    expect((await prompt(["0123456789abcdef01234567.png"])).status).toBe(409);
    const done = pending(host);
    expect((await prompt([id])).status).toBe(200);
    expect(text(await done)).toContain("Saw 1 image");
  } finally { server.close(); }
});
