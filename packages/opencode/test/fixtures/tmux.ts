// A terminal for tests: a command run in tmux, on a socket of its own, at a set size and in
// truecolour, read back as text (and, for previews, with its colours).

import { execFileSync, spawnSync } from "node:child_process";

export function hasTmux(): boolean {
  return spawnSync("tmux", ["-V"], { stdio: "ignore" }).status === 0;
}

export interface PaneOptions {
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  cwd?: string;
}

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export class Pane {
  private readonly socket = `isorite-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

  constructor(command: string[], { cols = 160, rows = 44, env = {}, cwd = process.cwd() }: PaneOptions = {}) {
    // The pane stays after the command exits, so what it last drew can still be read.
    const exports = Object.entries({ COLORTERM: "truecolor", ...env }).map(([k, v]) => `export ${k}=${quote(v)};`).join(" ");
    const shell = `cd ${quote(cwd)}; ${exports} ${command.map(quote).join(" ")}; echo; echo "[exited $?]"; sleep 600`;
    this.tmux("-f", "/dev/null", "new-session", "-d", "-s", "t", "-x", String(cols), "-y", String(rows), "bash", "-c", shell);
    this.tmux("set", "-g", "default-terminal", "tmux-256color");
    this.tmux("set", "-as", "terminal-features", ",*:RGB");
  }

  private tmux(...args: string[]): string {
    return execFileSync("tmux", ["-L", this.socket, ...args], { encoding: "utf8" });
  }

  /** What the pane shows, as text. */
  text(): string {
    return this.tmux("capture-pane", "-p", "-t", "t");
  }

  /** What the pane shows, with its colours as escape codes. */
  ansi(): string {
    return this.tmux("capture-pane", "-p", "-e", "-t", "t");
  }

  /** Types text, or presses keys by tmux's names (Enter, Escape, C-c). */
  keys(...keys: string[]): void {
    this.tmux("send-keys", "-t", "t", ...keys);
  }

  type(text: string): void {
    this.tmux("send-keys", "-t", "t", "-l", text);
  }

  /** Waits until the pane shows what is looked for; the pane's text is in the error if it never does. */
  async waitFor(look: RegExp | string, timeout = 30_000): Promise<string> {
    const started = Date.now();
    for (;;) {
      const text = this.text();
      if (typeof look === "string" ? text.includes(look) : look.test(text)) return text;
      if (Date.now() - started > timeout) throw new Error(`the pane never showed ${look}; it shows:\n${text}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  close(): void {
    try { this.tmux("kill-server"); } catch { /* already gone */ }
  }
}
