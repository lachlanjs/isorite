// Text to tasks and back. Pure: no files, no clock, so it can be tested with strings alone.

import type { Task } from "./task.ts";

const LINE = /^\[( |x)\] (.*)$/;
const DUE = /^due:(\d{4}-\d{2}-\d{2})$/;

// A line that is not a task (blank, or a comment someone typed in the file) gives null and is kept as it is by the store.
export function parseLine(line: string): Task | null {
  const m = LINE.exec(line);
  if (!m) return null;
  const words: string[] = [];
  const tags: string[] = [];
  let due: string | null = null;
  for (const word of m[2]!.split(" ")) {
    const d = DUE.exec(word);
    if (d) due = d[1]!;
    else if (word.startsWith("+") && word.length > 1) tags.push(word.slice(1));
    else words.push(word);
  }
  return { done: m[1] === "x", text: words.join(" ").trim(), tags, due };
}

// The inverse of parseLine, with the tags and the due day after the text, so a line reads the same however it was typed.
export function formatLine(task: Task): string {
  const parts = [task.text, ...task.tags.map((t) => `+${t}`)];
  if (task.due) parts.push(`due:${task.due}`);
  return `[${task.done ? "x" : " "}] ${parts.join(" ")}`;
}
