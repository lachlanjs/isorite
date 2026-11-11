import { test } from "node:test";
import assert from "node:assert/strict";
import { renderList } from "../src/render.ts";

const t = (text: string, due: string | null = null, done = false) => ({ done, text, tags: [], due });

test("open tasks come first, earliest due first, and late ones are marked", () => {
  const lines = renderList(
    [
      { id: 1, task: t("done one", null, true) },
      { id: 2, task: t("no day") },
      { id: 3, task: t("soon", "2026-01-02") },
      { id: 4, task: t("late", "2026-01-01") },
    ],
    "2026-01-02",
  );
  assert.deepEqual(lines, ["4 [ ] late (due 2026-01-01)  OVERDUE", "3 [ ] soon (due 2026-01-02)", "2 [ ] no day", "1 [x] done one"]);
});

test("an empty list says so", () => {
  assert.deepEqual(renderList([], "2026-01-01"), ["nothing to do"]);
});
