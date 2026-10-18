// The tour of isorite in the terminal, end to end: `isorite --tutorial` in tmux, walked as a person walks it,
// each step moving on when its card asks. With ISORITE_RECORD set to a file, each step's screen is kept there for
// the replay on the tutorial's site. Skipped without OpenCode 2 or tmux.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROMPTS, TOUR } from "../plugin/tour.ts";
import { findOpenCode, type Found } from "../src/opencode.ts";
import { hasTmux, Pane } from "./fixtures/tmux.ts";

const MAIN = fileURLToPath(new URL("../../server/src/main.ts", import.meta.url));
let opencode: Found | null = null;
try { opencode = findOpenCode(); } catch { /* skipped below */ }

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as { port: number };
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

/** One step of the replay: the card's words, what the person does next, and the screen as it was. */
interface Frame { step: number; title: string; text: string; does: string; screen: string }

describe.skipIf(opencode === null || !hasTmux())("isorite --tutorial", () => {
  let root: string, pane: Pane;
  const frames: Frame[] = [];
  /** Waits for step k's card, keeps its screen, and says what is done next. */
  const at = async (k: number, does: string, ready?: (t: string) => boolean) => {
    await pane.waitFor((t) => t.includes(TOUR[k]!.title) && t.includes(`tour · ${k + 1} of ${TOUR.length}`) && (ready?.(t) ?? true), 90_000);
    frames.push({ step: k, title: TOUR[k]!.title, text: TOUR[k]!.text, does, screen: pane.ansi() });
  };
  const command = async (text: string) => { pane.type(text); await new Promise((r) => setTimeout(r, 500)); pane.keys("Enter"); };

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "isorite-tour-"));
    pane = new Pane([process.execPath, MAIN, "--tutorial", join(root, "tour"), "--port", String(await freePort())], {
      cwd: root,
      // At home in the tour's folder, so that OpenCode shows its paths short (~/tour/code); the cache, which holds the
      // AI SDK package OpenCode fetches, is the real one.
      env: { PATH: process.env.PATH ?? "", HOME: root, XDG_CACHE_HOME: process.env.XDG_CACHE_HOME ?? join(process.env.HOME ?? root, ".cache"), ISORITE_OPENCODE: opencode!.command },
    });
  }, 60_000);

  afterAll(() => {
    if (process.env.ISORITE_RECORD) writeFileSync(process.env.ISORITE_RECORD, JSON.stringify({ cols: 160, rows: 44, frames }, null, 1));
    pane?.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("walks every step of the tour, each moving on when its card asks", async () => {
    await at(0, "press enter");
    pane.keys("Enter");

    await at(1, "press enter", (t) => t.includes(PROMPTS.ask));
    pane.keys("Enter");

    await at(2, "type /next", (t) => /the dmft loop\s+◆ used/.test(t));
    await command("/next");

    await at(3, "type /atlas the dmft loop");
    await command("/atlas the dmft loop");

    await at(4, "press enter, and allow the write", (t) => t.includes(PROMPTS.fix));
    pane.keys("Enter");
    const asked = await pane.waitFor(/Done\. The change|Allow|allow/, 60_000);
    if (!asked.includes("Done.")) pane.keys("Enter");

    await at(5, "type /note the dmft loop");
    await command("/note the dmft loop");

    await at(6, "press k", (t) => t.includes("not kept yet"));
    pane.keys("k");

    await at(7, "press /, ask, press enter");
    pane.keys("/");
    await pane.waitFor("Ask Iso here", 10_000);
    pane.type("say why it swings");
    pane.keys("Enter");

    await at(8, "press t, choose a moment", (t) => t.includes("◆ Iso · not kept yet"));
    pane.keys("t");
    await pane.waitFor("The note's timeline");
    pane.keys("Down", "Enter");

    await at(9, "press q, then s, and say what you want", (t) => t.includes("as it was"));
    pane.keys("q");
    await pane.waitFor((t) => !t.includes("as it was"));
    pane.keys("s");
    await pane.waitFor("Send to the agent");
    pane.type("is this the loop you meant?");
    pane.keys("Enter");

    await at(10, "press q, then type /next");
    pane.keys("q");
    await command("/next");
    await pane.waitFor((t) => !t.includes("tour · "));
    expect(frames.map((f) => f.step)).toEqual(TOUR.map((_, k) => k));
  }, 600_000);
});
