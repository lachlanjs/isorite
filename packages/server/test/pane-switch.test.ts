// A pane whose host changes while the server runs (sessions.ts `switchable`): isorite's own agent, chosen in the
// settings, takes the pane at once, and whoever listens is told its view.

import { describe, expect, test } from "vitest";
import type { TerminalView } from "@isorite/engine";
import { switchable, type PaneSessions } from "../src/sessions.ts";

function host(name: string, more: Partial<PaneSessions> = {}): PaneSessions & { listeners: Set<(v: TerminalView) => void>; prompted: string[] } {
  const listeners = new Set<(v: TerminalView) => void>(), prompted: string[] = [];
  return {
    listeners, prompted,
    view: () => ({ agent: name } as unknown as TerminalView),
    listen: (fn: (v: TerminalView) => void) => { listeners.add(fn); return () => listeners.delete(fn); },
    asked: () => "",
    prompt: async (t: string) => { prompted.push(t); },
    ...more,
  } as never;
}

describe("a pane whose host changes", () => {
  test("asks the host shown now, has what it has, and moves its listeners to the new one, telling them its view", async () => {
    const first = host("none"), pi = host("pi", { steer: async () => undefined });
    const { pane, use } = switchable(first);
    const views: string[] = [];
    const stop = pane.listen((v) => views.push((v as unknown as { agent: string }).agent));
    await pane.prompt("one");
    expect(first.prompted).toEqual(["one"]);
    expect(pane.steer).toBeUndefined();
    use(pi);
    expect(views).toEqual(["pi"]);
    expect(first.listeners.size).toBe(0);
    expect(pi.listeners.size).toBe(1);
    await pane.prompt("two");
    expect(pi.prompted).toEqual(["two"]);
    expect(typeof pane.steer).toBe("function");
    expect(pane.view()).toEqual({ agent: "pi" });
    stop();
    expect(pi.listeners.size).toBe(0);
  });
});

describe("a pane with no agent chosen yet", () => {
  test("shows nothing connected, takes no prompt, and says how to have an agent", async () => {
    const { NoAgent } = await import("../src/sessions.ts");
    const none = new NoAgent();
    expect(none.view().connected).toBe(false);
    await expect(none.prompt()).rejects.toThrow(/isorite setup/);
    await expect(none.interrupt()).resolves.toBeUndefined();
  });
});
