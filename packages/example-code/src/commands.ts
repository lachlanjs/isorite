// What each command does to the store. Each takes the store and its arguments and returns the lines to print: it does not print, and it does not save.

import { UsageError } from "./errors.ts";
import { parseLine } from "./parse.ts";
import { renderList, renderTask } from "./render.ts";
import type { Args } from "./args.ts";
import type { Store } from "./store.ts";

export type Command = (store: Store, args: Args, today: string) => string[];

// The words of `add` are read as a line, so `add buy milk +home due:2026-12-01` needs no special syntax.
const add: Command = (store, args) => {
  const task = parseLine(`[ ] ${args.words.join(" ")}`);
  if (!task || task.text === "") throw new UsageError("add what? Give the task as words.");
  const id = store.add(task);
  return [`added ${id}: ${renderTask(task)}`];
};

const done: Command = (store, args) => {
  const id = idOf(args);
  if (!store.update(id, (t) => ({ ...t, done: true }))) throw new UsageError(`no task ${id}`);
  return [`done ${id}`];
};

const remove: Command = (store, args) => {
  const id = idOf(args);
  if (!store.remove(id)) throw new UsageError(`no task ${id}`);
  return [`removed ${id}`];
};

const list: Command = (store, args, today) => {
  const shown = store
    .tasks()
    .filter(({ task }) => (args.all || !task.done) && (!args.tag || task.tags.includes(args.tag)));
  return renderList(shown, today);
};

// Commands that change the store, so main.ts knows to save after them.
export const writes = new Set(["add", "done", "remove"]);

export const commands: Record<string, Command> = { add, done, remove, list };

function idOf(args: Args): number {
  const id = Number(args.words[0]);
  if (!Number.isInteger(id) || id < 1) throw new UsageError(`${args.command} needs a task number`);
  return id;
}
