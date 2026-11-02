// How isorite's commands look in a terminal (M32): a little weight and colour, only where a person is looking.
// Piped, in a file, with NO_COLOR set or TERM=dumb, the text is exactly what it was. FORCE_COLOR turns it on anyway.
// Dim for what is said about a thing, bold for the thing, red for what failed, green for what is well, yellow for
// what is worth a look. Gold is Iso's alone (docs/taste.md), so it is not used.

const wrap = (open: number, close: number) => (text: string): string => (colour() ? `\x1b[${open}m${text}\x1b[${close}m` : text);

/** Whether to paint: asked each time, so a test or a caller can change the environment. */
export function colour(env: NodeJS.ProcessEnv = process.env, tty: boolean = Boolean(process.stdout.isTTY)): boolean {
  if (env.NO_COLOR) return false;
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== "0" && env.FORCE_COLOR !== "false";
  return tty && env.TERM !== "dumb";
}

export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const red = wrap(31, 39);
export const green = wrap(32, 39);
export const yellow = wrap(33, 39);

/** A help text with its commands in bold and what they say dimmed: a line `  isorite word …  said` and its continuations. */
export function helpText(text: string): string {
  if (!colour()) return text;
  return text.split("\n").map((line, i) => {
    if (i === 0) return bold(line);
    if (/^ {20,}\S/.test(line)) return dim(line);
    const m = /^(  isorite(?: [a-z-]+)?)( .*?)(\s{2,})(\S.*)$/.exec(line);
    if (m) return `${bold(m[1]!)}${m[2]}${m[3]}${dim(m[4]!)}`;
    const c = /^(  isorite(?: [a-z-]+)?)(.*)$/.exec(line);
    return c ? `${bold(c[1]!)}${c[2]}` : line;
  }).join("\n");
}
