// The tour of isorite in the terminal, end to end: `isorite --tutorial` in tmux, walked as a person walks it,
// each step moving on when its card asks. With ISORITE_RECORD set to a file, each step's screen is kept there for
// the replay on the tutorial's site. Skipped without OpenCode 2 or tmux.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
      env: { PATH: process.env.PATH ?? "", HOME: root, ISORITE_NO_BROWSER: "1", XDG_CACHE_HOME: process.env.XDG_CACHE_HOME ?? join(process.env.HOME ?? root, ".cache"), ISORITE_OPENCODE: opencode!.command },
    });
  }, 60_000);

  afterAll(() => {
    if (process.env.ISORITE_RECORD) writeFileSync(process.env.ISORITE_RECORD, JSON.stringify({ cols: 160, rows: 44, frames }, null, 1));
    pane?.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("walks every step of the tour, each moving on when its card asks", async () => {
    /** Until the agent's answer says `done`: OpenCode asks before it writes a file, and each is allowed. */
    const allowUntil = async (done: string) => {
      for (;;) {
        const t = await pane.waitFor((t) => t.includes(done) || /Allow|allow/.test(t), 90_000);
        if (t.includes(done)) return;
        pane.keys("Enter");
        await pane.waitFor((t) => t.includes(done) || !/Allow|allow/.test(t), 30_000);
      }
    };
    await at(0, "press enter");
    pane.keys("Enter");

    await at(1, "press enter, and allow the write", (t) => t.includes(PROMPTS.code.slice(0, 40)));
    pane.keys("Enter");
    await allowUntil("[2] initial conditions");

    await at(2, "type /next", (t) => /leapfrog\s+◆ used/.test(t));
    await command("/next");

    await at(3, "press enter, and allow the write", (t) => t.includes(PROMPTS.tree.slice(0, 40)));
    pane.keys("Enter");
    await allowUntil("[2] two galaxies colliding");

    await at(4, "type /next");
    await command("/next");

    await at(5, "type /atlas barnes hut");
    await command("/atlas barnes hut");

    await at(6, "type /note two galaxies", (t) => t.includes("atlas · barnes"));
    await command("/note two galaxies");

    await at(7, "press k", (t) => t.includes("not kept yet"));
    pane.keys("k");

    await at(8, "press /, ask, press enter");
    pane.keys("/");
    await pane.waitFor("Ask Iso here", 10_000);
    pane.type("say what changes in 3D");
    pane.keys("Enter");

    await at(9, "press t, choose a moment", (t) => t.includes("◆ Iso · not kept yet"));
    pane.keys("t");
    await pane.waitFor("The note's timeline");
    pane.keys("Down", "Enter");

    await at(10, "press q, then s, and say what you want", (t) => t.includes("as it was"));
    pane.keys("q");
    await pane.waitFor((t) => !t.includes("as it was"));
    pane.keys("s");
    await pane.waitFor("Send to the agent");
    pane.type("use this in barnes_hut.py");
    pane.keys("Enter");

    await at(11, "press q, then type /next");
    pane.keys("q");
    await command("/next");
    await pane.waitFor((t) => !t.includes("tour · "));
    expect(frames.map((f) => f.step)).toEqual(TOUR.map((_, k) => k));
    // The code it wrote is there, and the note's change was kept.
    expect(readFileSync(join(root, "tour", "code", "sim.py"), "utf8")).toContain("v += 0.5 * dt * a");
    expect(readFileSync(join(root, "tour", "code", "barnes_hut.py"), "utf8")).toContain("THETA = 0.5");
  }, 600_000);
});
