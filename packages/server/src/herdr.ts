// What isorite's own agent is doing, told to herdr (herdr.dev) when `isorite serve` runs in one of its terminals. herdr
// reads a program's status only from OSC 7501, the Program Status Protocol (revision 0.4,
// superlogical.com/rex/docs/build/program-status), and shows it beside the program's terminal: working, blocked on the
// person, done. Here the agent's turns become those words. Off anywhere but a herdr terminal on a real terminal, so no
// other terminal, pipe or log ever gets the escape codes; ISORITE_HERDR=0 turns it off there too.

import type { TerminalView } from "@isorite/engine";
import type { PaneSessions } from "./sessions.ts";

/** The protocol's states that isorite reports (it never sends `clear`: herdr drops working and blocked when the
 *  program exits). */
export type Word = "idle" | "working" | "done" | "blocked" | "error";

export interface Status { state: Word; /** With blocked only. isorite's agent only ever waits for an approval. */ kind?: "permission"; /** One line for the person. */ msg?: string }

/** The program's stable name in every report, as herdr groups and labels by it ([A-Za-z0-9_.+-]{1,32}). */
export const APP = "isorite";

/** Whether to report: in a terminal herdr-core started (it sets HC_TERMINAL_ID in every one, herdr's own included),
 *  with standard output that terminal, and not turned off. */
export function inHerdr(env: NodeJS.ProcessEnv = process.env, tty: boolean = Boolean(process.stdout.isTTY)): boolean {
  if (env.ISORITE_HERDR === "0") return false;
  return tty && Boolean(env.HC_TERMINAL_ID);
}

/** At most this many characters of a message: the protocol allows 2048 bytes decoded, and herdr shows one short line. */
const LONGEST = 120;

/** A message the protocol will take: one line, no control characters (a report with one is discarded whole), short. */
export function oneLine(text: string): string {
  const flat = text.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim();
  const chars = [...flat];
  return chars.length > LONGEST ? `${chars.slice(0, LONGEST - 1).join("")}…` : flat;
}

/** One report: `OSC 7501 ; state=…:kind=…:app=isorite:msg=<base64> ST`, with ST as ESC backslash. Keys are only sent
 *  where the protocol reads them (kind with blocked), and msg is standard base64 of UTF-8, as free text must be. */
export function encode(s: Status): string {
  const pairs = [`state=${s.state}`];
  if (s.state === "blocked" && s.kind) pairs.push(`kind=${s.kind}`);
  pairs.push(`app=${APP}`);
  const msg = s.msg ? oneLine(s.msg) : "";
  if (msg) pairs.push(`msg=${Buffer.from(msg, "utf8").toString("base64")}`);
  return `\x1b]7501;${pairs.join(":")}\x1b\\`;
}

const firstLine = (text: string) => text.split("\n").find((l) => l.trim()) ?? "";

/** The word for the agent's sessions across the server's bases, given the word last reported; null when nothing new is
 *  to be said. Asking for an approval anywhere is blocked; a turn running anywhere is working. Once nothing runs, the
 *  turn that ran says how it ended: stopped by the person is idle (as the protocol asks), failed is error, else done.
 *  A done or error stays as it is until the next turn: herdr itself turns done into idle once the person has looked. */
export function statusOf(views: TerminalView[], was: Word | ""): Status | null {
  const asking = views.find((v) => v.asking.length > 0)?.asking[0];
  if (asking) return { state: "blocked", kind: "permission", msg: `Approve: ${[asking.action, ...asking.resources].join(" ")}` };
  const running = views.flatMap((v) => v.turns).find((t) => t.state === "running");
  const busy = views.find((v) => v.busy);
  if (running || busy) return { state: "working", msg: firstLine(running?.asked ?? busy?.turns.at(-1)?.asked ?? "") };
  if (was === "") return { state: "idle" };
  if (was !== "working" && was !== "blocked") return null;
  const last = views.map((v) => v.turns.at(-1)).filter((t) => t !== undefined);
  if (last.some((t) => t.state === "failed")) return { state: "error", msg: "The turn failed" };
  if (last.length > 0 && last.every((t) => t.state === "stopped")) return { state: "idle" };
  const done = last.find((t) => t.state === "done");
  return { state: "done", msg: done ? `Answered: ${firstLine(done.asked)}` : "" };
}

/** Reports the agent's word as it changes, for every base's pane the server holds: one report per change, never the
 *  same one twice in a row. */
export class HerdrStatus {
  #views = new Map<string, TerminalView>();
  #word: Word | "" = "";
  #last = "";
  #write: (bytes: string) => void;

  constructor(write: (bytes: string) => void = (bytes) => { process.stdout.write(bytes); }) { this.#write = write; }

  /** Follow a base's pane from now on. */
  watch(base: string, pane: PaneSessions): void {
    this.#views.set(base, pane.view());
    pane.listen((view) => { this.#views.set(base, view); this.#update(); });
    this.#update();
  }

  #update(): void {
    const next = statusOf([...this.#views.values()], this.#word);
    if (!next) return;
    const bytes = encode(next);
    if (bytes === this.#last) return;
    this.#last = bytes;
    this.#word = next.state;
    this.#write(bytes);
  }
}
