// Tasks as text for a person. The only module that decides what the output looks like.

import type { Task } from "./task.ts";

export function renderTask(task: Task): string {
  const tags = task.tags.map((t) => ` +${t}`).join("");
  return `${task.text}${tags}${task.due ? ` (due ${task.due})` : ""}`;
}

// Open tasks first, the earliest due first, then the rest in the order they were written. Overdue ones are marked.
export function renderList(items: { id: number; task: Task }[], today: string): string[] {
  if (items.length === 0) return ["nothing to do"];
  const sorted = [...items].sort((a, b) => rank(a.task) - rank(b.task) || dueKey(a.task).localeCompare(dueKey(b.task)) || a.id - b.id);
  const width = String(Math.max(...items.map((i) => i.id))).length;
  return sorted.map(({ id, task }) => {
    const box = task.done ? "x" : " ";
    const late = !task.done && task.due !== null && task.due < today ? "  OVERDUE" : "";
    return `${String(id).padStart(width)} [${box}] ${renderTask(task)}${late}`;
  });
}

const rank = (t: Task) => (t.done ? 1 : 0);
// A task with no due day sorts after every task that has one.
const dueKey = (t: Task) => t.due ?? "9999-99-99";
