// How the terminal commands are painted (M32): only at a terminal, never with NO_COLOR, and the text is the same plain.

import { afterEach, expect, test } from "vitest";
import { bold, colour, dim, helpText } from "../src/term.ts";

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

test("paint is for a terminal: not piped, not with NO_COLOR or a dumb terminal, and FORCE_COLOR turns it on", () => {
  expect(colour({}, true)).toBe(true);
  expect(colour({}, false)).toBe(false);
  expect(colour({ NO_COLOR: "1" }, true)).toBe(false);
  expect(colour({ NO_COLOR: "1", FORCE_COLOR: "1" }, true)).toBe(false);
  expect(colour({ TERM: "dumb" }, true)).toBe(false);
  expect(colour({ FORCE_COLOR: "1" }, false)).toBe(true);
  expect(colour({ FORCE_COLOR: "0" }, true)).toBe(false);
});

test("plain, the text is exactly the text; painted, it is the text with escapes round it", () => {
  delete process.env.NO_COLOR; delete process.env.FORCE_COLOR;
  expect(bold("x")).toBe("x");
  expect(helpText("a\n  isorite doctor   says\n")).toBe("a\n  isorite doctor   says\n");
  process.env.FORCE_COLOR = "1";
  expect(bold("x")).toBe("\x1b[1mx\x1b[22m");
  expect(dim("x")).toBe("\x1b[2mx\x1b[22m");
  const help = helpText("title\n  isorite doctor   says it\n                    and more\n  isorite check <n>");
  expect(help.replace(/\x1b\[\d+m/g, "")).toBe("title\n  isorite doctor   says it\n                    and more\n  isorite check <n>");
  expect(help).toContain("\x1b[1m  isorite doctor\x1b[22m");
  expect(help).toContain("\x1b[2msays it\x1b[22m");
});
