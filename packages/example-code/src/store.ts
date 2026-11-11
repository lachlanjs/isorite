// The file of tasks. It keeps every line, tasks or not, so editing the file by hand is safe.

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { formatLine, parseLine } from "./parse.ts";
import type { Task } from "./task.ts";

export class Store {
  // Every line of the file. A task is a line that parses; its id is its place among the tasks, from 1.
  private lines: string[];
  private path: string;

  constructor(path: string) {
    this.path = path;
    this.lines = readLines(path);
  }

  tasks(): { id: number; task: Task }[] {
    const out: { id: number; task: Task }[] = [];
    for (const line of this.lines) {
      const task = parseLine(line);
      if (task) out.push({ id: out.length + 1, task });
    }
    return out;
  }

  add(task: Task): number {
    this.lines.push(formatLine(task));
    return this.tasks().length;
  }

  // Replace the task with this id, or return false when there is none.
  update(id: number, change: (t: Task) => Task): boolean {
    const at = this.lineOf(id);
    if (at < 0) return false;
    this.lines[at] = formatLine(change(parseLine(this.lines[at]!)!));
    return true;
  }

  remove(id: number): boolean {
    const at = this.lineOf(id);
    if (at < 0) return false;
    this.lines.splice(at, 1);
    return true;
  }

  // Written to a temporary file and renamed over the real one, so a crash leaves the old file whole.
  save(): void {
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, this.lines.join("\n") + "\n");
    renameSync(tmp, this.path);
  }

  private lineOf(id: number): number {
    let n = 0;
    for (let i = 0; i < this.lines.length; i++) if (parseLine(this.lines[i]!) && ++n === id) return i;
    return -1;
  }
}

// A file that is not there yet is an empty list, not an error: the first `add` makes it.
function readLines(path: string): string[] {
  try {
    const text = readFileSync(path, "utf8");
    return text === "" ? [] : text.replace(/\n$/, "").split("\n");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}
