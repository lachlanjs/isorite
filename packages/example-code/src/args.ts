// Words typed after the command name, as a command and what it was given. No flags library: there are two flags.

import { UsageError } from "./errors.ts";

export interface Args {
  command: string;
  // What followed the command, flags removed.
  words: string[];
  // --all and --tag NAME, the only flags there are.
  all: boolean;
  tag: string | null;
}

export function parseArgs(argv: string[]): Args {
  const [command = "list", ...rest] = argv;
  const args: Args = { command, words: [], all: false, tag: null };
  for (let i = 0; i < rest.length; i++) {
    const word = rest[i]!;
    if (word === "--all") args.all = true;
    else if (word === "--tag") {
      const name = rest[++i];
      if (!name) throw new UsageError("--tag needs a name");
      args.tag = name;
    } else args.words.push(word);
  }
  return args;
}
