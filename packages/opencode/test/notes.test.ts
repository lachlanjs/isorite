import { describe, expect, it } from "vitest";
import { noteOf } from "../plugin/notes.ts";

describe("a note of the knowledge base", () => {
  const notes = "/home/l/dmft-notes", code = "/home/l/solver";
  it("is a Markdown file inside its folder, named by its path there", () => {
    expect(noteOf(notes, code, "/home/l/dmft-notes/dmft/the-dmft-loop.md")).toBe("dmft/the-dmft-loop.md");
    expect(noteOf(notes, "/home/l/dmft-notes", "dmft/loop.MD")).toBe("dmft/loop.MD");
    expect(noteOf(notes, code, "../dmft-notes/top.md")).toBe("top.md");
  });
  it("is not code, nor a file beside the folder, nor another kind of file in it", () => {
    expect(noteOf(notes, code, "README.md")).toBeNull();
    expect(noteOf(notes, code, "/home/l/dmft-notes-study/journal.md")).toBeNull();
    expect(noteOf(notes, code, "/home/l/dmft-notes/figures/loop.svg")).toBeNull();
    expect(noteOf(notes, code, "/home/l/dmft-notes")).toBeNull();
    expect(noteOf(null, code, "/home/l/dmft-notes/a.md")).toBeNull();
    expect(noteOf(notes, code, 42)).toBeNull();
  });
});
