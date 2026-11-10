// How the setup wizard asks: numbered lists and plain lines, on readline, so it works the same in Windows Terminal,
// macOS Terminal, over SSH, in Codespaces and inside the single executable. No cursor keys, no redrawing, no
// dependency. Enter takes the default shown. A key is typed with nothing echoed.

import { createInterface, type Interface } from "node:readline";
import { Writable } from "node:stream";
import { bold, dim } from "../term.ts";

export interface Option { label: string; hint?: string }

/** What the wizard asks through. `terminal()` is the real one; `defaults()` answers every question with its default
 *  (for --yes); the tests give a scripted one. */
export interface Prompter {
  /** The index of the option chosen; `def` on Enter. */
  select(question: string, options: Option[], def?: number): Promise<number>;
  confirm(question: string, def?: boolean): Promise<boolean>;
  text(question: string, def?: string): Promise<string>;
  /** A secret, typed without echo. Never logged. */
  secret(question: string): Promise<string>;
  /** A line said to the person (not a question). */
  say(line: string): void;
  close(): void;
}

/** Asked to stop (Ctrl-C, Ctrl-D, the input ending): nothing more is asked, nothing more is written. */
export class Cancelled extends Error {
  constructor() { super("setup stopped"); }
}

export function terminal(input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout): Prompter {
  let muted = false;
  const sink = new Writable({ write(chunk, _enc, done) { if (!muted) output.write(chunk); done(); } });
  const rl: Interface = createInterface({ input, output: sink, terminal: Boolean((input as { isTTY?: boolean }).isTTY) });
  let ended = false;
  const waiting = new Set<() => void>();
  rl.on("close", () => { ended = true; for (const w of waiting) w(); });
  const say = (line: string) => { output.write(line + "\n"); };
  const ask = (prompt: string): Promise<string> => new Promise((done, fail) => {
    if (ended) return fail(new Cancelled());
    const stop = () => fail(new Cancelled());
    waiting.add(stop);
    rl.question(prompt, (answer) => { waiting.delete(stop); done(answer.trim()); });
  });
  return {
    say,
    close: () => rl.close(),
    async select(question, options, def = 0) {
      say(`\n${bold(question)}`);
      options.forEach((o, i) => say(`  ${dim(String(i + 1) + ")")} ${o.label}${o.hint ? dim(`  ${o.hint}`) : ""}`));
      for (;;) {
        const answer = await ask(`Choose 1-${options.length} ${dim(`[${def + 1}]`)} `);
        if (!answer) return def;
        const n = Number(answer);
        if (Number.isInteger(n) && n >= 1 && n <= options.length) return n - 1;
        say(`  a number from 1 to ${options.length}, or Enter for ${def + 1}`);
      }
    },
    async confirm(question, def = true) {
      for (;;) {
        const answer = (await ask(`${question} ${dim(def ? "[Y/n]" : "[y/N]")} `)).toLowerCase();
        if (!answer) return def;
        if (/^y(es)?$/.test(answer)) return true;
        if (/^n(o)?$/.test(answer)) return false;
      }
    },
    async text(question, def) {
      const answer = await ask(`${question}${def ? ` ${dim(`[${def}]`)}` : ""} `);
      return answer || def || "";
    },
    async secret(question) {
      muted = true;
      output.write(`${question} ${dim("(nothing is shown as you type or paste)")} `);
      try { return await ask(""); } finally { muted = false; output.write("\n"); }
    },
  };
}

/** Answers every question with its default and says nothing it need not: for --yes. A secret is never defaulted. */
export function defaults(say: (line: string) => void = console.log): Prompter {
  return {
    say,
    close: () => undefined,
    select: async (_q, _o, def = 0) => def,
    confirm: async (_q, def = true) => def,
    text: async (_q, def) => def ?? "",
    secret: async () => "",
  };
}
