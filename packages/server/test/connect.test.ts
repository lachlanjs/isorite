import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { proposal, writeProposal } from "../src/connect.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-connect-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("the project's MCP config (M25): the base by its folder in the repository, offered, written on a yes, what else is there kept", () => {
  const repo = join(root, "project"), notes = join(repo, "docs", "notes");
  mkdirSync(join(repo, ".git"), { recursive: true });
  mkdirSync(notes, { recursive: true });
  writeFileSync(join(repo, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "other" } } }));

  const before = proposal(notes);
  expect(before.repo).toBe(repo);
  expect(before.files.map((f) => [f.file, f.current, f.before === null])).toEqual([[".mcp.json", false, false], ["opencode.json", false, true]]);
  expect(JSON.parse(before.files[0]!.after)).toEqual({ mcpServers: { other: { command: "other" }, isorite: { command: "isorite", args: ["mcp", "docs/notes"] } } });

  expect(writeProposal(notes, ["opencode.json"])).toEqual(["opencode.json"]);
  expect(JSON.parse(readFileSync(join(repo, "opencode.json"), "utf8"))).toEqual({ mcp: { servers: { isorite: { type: "local", command: ["isorite", "mcp", "docs/notes"] } } } });
  expect(writeProposal(notes)).toEqual([".mcp.json"]);
  expect(proposal(notes).files.every((f) => f.current)).toBe(true);
  expect(writeProposal(notes)).toEqual([]);

  // A file that isn't JSON is left as it is.
  writeFileSync(join(repo, ".mcp.json"), "{ not json");
  expect(writeProposal(notes)).toEqual([]);
  expect(readFileSync(join(repo, ".mcp.json"), "utf8")).toBe("{ not json");
});

test("a base in no repository has its harness config in its own folder", () => {
  const notes = join(root, "loose");
  mkdirSync(notes);
  expect(proposal(notes)).toMatchObject({ repo: notes, files: [{ after: expect.stringContaining('"mcp",\n        "."') }, {}] });
});

test("a base named notes in a folder that is no repository has its config in that folder, the project (M37)", () => {
  const project = join(root, "plain-project"), notes = join(project, "notes");
  mkdirSync(notes, { recursive: true });
  const p = proposal(notes);
  expect(p.repo).toBe(project);
  expect(p.files[1]!.after).toContain('"notes"');
  expect(writeProposal(notes, ["opencode.json"])).toEqual(["opencode.json"]);
  expect(readFileSync(join(project, "opencode.json"), "utf8")).toContain('"notes"');
});
