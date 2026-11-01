// `isorite` with no arguments (M26): which base it opens, what it offers, and the order of the list.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { rememberBase, touchBase } from "../src/config.ts";
import { findBase, freePort, label, offerModel, recent, start, type StartIo } from "../src/start.ts";

const temp = () => mkdtempSync(join(tmpdir(), "isorite-start-"));
const base = (dir: string) => { mkdirSync(join(dir, ".isorite"), { recursive: true }); return dir; };

function io(cwd: string, config: string, answers: { yes?: boolean; pick?: number | null } = {}) {
  const said: string[] = [], did: string[] = [];
  const o: StartIo = {
    cwd, config, out: (l) => said.push(l),
    confirm: async (q) => { said.push(q); return answers.yes ?? false; },
    choose: async (q) => { said.push(q); return answers.pick ?? null; },
    open: async (n) => { did.push(`open ${n}`); return 0; },
    make: (f) => { base(f); did.push(`make ${f}`); return f; },
    guide: async () => { did.push("guide"); return 0; },
  };
  return { o, said, did };
}

test("a base is found where the command is run, above it, or just inside the repository's top", () => {
  const repo = temp();
  mkdirSync(join(repo, ".git"));
  const notes = base(join(repo, "notes")), deep = join(repo, "src", "a");
  mkdirSync(deep, { recursive: true });
  expect(findBase(repo)).toEqual({ kind: "base", notes });
  expect(findBase(deep)).toEqual({ kind: "base", notes });
  expect(findBase(join(notes, "sub"))).toEqual({ kind: "base", notes });
  base(join(repo, "other"));
  expect(findBase(repo)).toEqual({ kind: "several", notes: [join(repo, "notes"), join(repo, "other")] });
});

test("a repository with no base, and a folder with none and no repository", () => {
  const repo = temp(), loose = temp();
  mkdirSync(join(repo, ".git"));
  expect(findBase(repo)).toEqual({ kind: "repo", repo });
  expect(findBase(loose)).toEqual({ kind: "none" });
});

test("in a repository with no base, notes/ is offered once, and made on a yes", async () => {
  const repo = temp(), config = join(temp(), "config.toml");
  mkdirSync(join(repo, ".git"));
  const yes = io(repo, config, { yes: true });
  expect(await start(yes.o)).toBe(0);
  expect(yes.did).toEqual([`make ${join(repo, "notes")}`, `open ${join(repo, "notes")}`]);
  const other = temp();
  mkdirSync(join(other, ".git"));
  const no = io(other, config, { yes: false });
  await start(no.o);
  expect(no.did).toEqual([]);
});

test("the first ever run offers the guide", async () => {
  const run = io(temp(), join(temp(), "config.toml"), { yes: true });
  await start(run.o);
  expect(run.did).toEqual(["guide"]);
});

test("known bases are listed last used first, and chosen by number; a new base and the guide follow them", async () => {
  const config = join(temp(), "config.toml"), a = base(join(temp(), "alpha")), b = base(join(temp(), "beta"));
  rememberBase(a, { path: config });
  rememberBase(b, { path: config });
  touchBase(a, { path: config, now: new Date("2026-11-01T10:00:00Z") });
  touchBase(b, { path: config, now: new Date("2026-11-02T10:00:00Z") });
  expect(recent(config).map((x) => x.path)).toEqual([b, a]);

  const here = temp();
  const first = io(here, config, { pick: 0 });
  await start(first.o);
  expect(first.did).toEqual([`open ${b}`]);
  const fresh = io(here, config, { pick: 2 });
  await start(fresh.o);
  expect(fresh.did).toEqual([`make ${join(here, "notes")}`, `open ${join(here, "notes")}`]);
  const guide = io(temp(), config, { pick: 3 });
  await start(guide.o);
  expect(guide.did).toEqual(["guide"]);
  const none = io(temp(), config, { pick: null });
  expect(await start(none.o)).toBe(2);
});

test("two bases of one name are told apart by their project", () => {
  const config = join(temp(), "config.toml"), x = base(join(temp(), "proj-a", "notes")), y = base(join(temp(), "proj-b", "notes"));
  rememberBase(x, { path: config });
  rememberBase(y, { path: config });
  const known = recent(config);
  expect(known.map((k) => label(k, known))).toEqual(expect.arrayContaining([expect.stringContaining("(proj-a)"), expect.stringContaining("(proj-b)")]));
});

test("a taken port is passed over", async () => {
  const { createServer } = await import("node:net");
  const taken = createServer();
  await new Promise<void>((r) => taken.listen(0, "127.0.0.1", r));
  const port = (taken.address() as { port: number }).port;
  expect(await freePort(port)).toBeGreaterThan(port);
  taken.close();
  writeFileSync(join(temp(), "x"), "");
});

test("the model is offered once: fetched on a yes, a no remembered, a failure said and the start goes on", async () => {
  const run = async (o: { installed?: boolean; off?: boolean; declined?: boolean; yes?: boolean; fetched?: number }) => {
    const did: string[] = [];
    await offerModel({
      installed: o.installed ?? false, off: o.off ?? false, declined: o.declined ?? false,
      confirm: async () => { did.push("asked"); return o.yes ?? false; },
      fetch: async () => { did.push("fetch"); return o.fetched ?? 0; }, decline: () => did.push("declined"), out: (l) => did.push(`said ${l.trim().split(";")[0]}`),
    });
    return did;
  };
  expect(await run({ yes: true })).toEqual(["asked", "fetch"]);
  expect(await run({ yes: false })).toEqual(["asked", "declined", "said not fetched"]);
  expect(await run({ yes: true, fetched: 1 })).toEqual(["asked", "fetch", "said search by words, for now: isorite doctor says what stopped the fetch"]);
  for (const skip of [{ installed: true }, { off: true }, { declined: true }]) expect(await run(skip)).toEqual([]);
});
