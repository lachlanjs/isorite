import { expect, test } from "vitest";
import { SNAPSHOT_EVERY, change, replay, setSha256, sha256, sha256Pure, type Entry } from "../src/index.ts";

test("replaying from the last snapshot gives what replaying the whole journal gives, at any point", () => {
  const entries: Entry[] = [];
  let text = "one\n";
  for (let k = 0; k < SNAPSHOT_EVERY * 2 + 7; k++) {
    text += `line ${k}\n`;
    const e = change(entries, text, { id: String(1000 + k), at: "2026-11-09T09:00:00Z", session: "s", device: "d", who: "you" }, "edit");
    entries.push(e!);
  }
  expect(entries.filter((e) => e.text !== undefined).length).toBeGreaterThan(2);
  for (const e of entries) {
    const r = replay(entries, e.id)!;
    expect(r.broken).toEqual([]);
    expect(r.text).toBe(e.text ?? r.text);
    expect(r.hash).toBe(e.after);
  }
  expect(replay(entries)!.text).toBe(text);
});

test("a hasher set from outside gives the same digests as the pure one", () => {
  const pure = (m: string | Uint8Array) => sha256Pure(m);
  expect(sha256("abc")).toBe(pure("abc"));
  let called = 0;
  setSha256((m) => { called++; return pure(m); });
  try { expect(sha256("abc")).toBe(pure("abc")); expect(called).toBe(1); } finally { setSha256(null); }
});
