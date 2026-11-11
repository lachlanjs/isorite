// The command: read the arguments, run one command on the store, save if it changed anything, print. The only module that touches the process.

import { parseArgs } from "./args.ts";
import { commands, writes } from "./commands.ts";
import { UsageError } from "./errors.ts";
import { Store } from "./store.ts";

// The tasks file is TALLY_FILE, or tasks.txt where the command is run.
export function run(argv: string[], env: Record<string, string | undefined>, today: string): { lines: string[]; code: number } {
  try {
    const args = parseArgs(argv);
    const command = commands[args.command];
    if (!command) throw new UsageError(`unknown command ${args.command}. Try add, list, done or remove.`);
    const store = new Store(env.TALLY_FILE ?? "tasks.txt");
    const lines = command(store, args, today);
    if (writes.has(args.command)) store.save();
    return { lines, code: 0 };
  } catch (e) {
    if (e instanceof UsageError) return { lines: [e.message], code: 1 };
    throw e;
  }
}

// Only when run as the command, so the tests can import run() without starting it.
if (import.meta.main) {
  const { lines, code } = run(process.argv.slice(2), process.env, new Date().toISOString().slice(0, 10));
  for (const line of lines) (code === 0 ? console.log : console.error)(line);
  process.exitCode = code;
}
