import { expect, test } from "@playwright/test";
import { toIso } from "./agent.ts";

// Chat in Iso's pane (M28): signing in by a code given to the host, the project's threads read as a conversation,
// a reply sent by a press. The host is played by the page's own routes: the server's side (the hosts, the device
// flow, what is kept) has its tests in packages/server/test/chat.test.ts.

const ana = { login: "ana", name: "Ana", avatar: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", url: "" };
const ben = { login: "ben", name: "Ben", avatar: "", url: "" };
const repo = { host: "github", server: "github.com", path: "ana/proj", url: "https://github.com/ana/proj" };
const host = (me: unknown) => ({ id: "github", server: "github.com", name: "GitHub", me, via: me ? "device" : null, canSignIn: true, cli: false });
const thread = { kind: "issue", number: 3, title: "Search is slow", open: true, author: ben, at: "2026-01-02T00:00:00Z", updated: new Date().toISOString(), replies: 1, url: "https://github.com/ana/proj/issues/3" };

test("sign in with a code, read a thread as a conversation, reply by pressing send", async ({ page }) => {
  let signedIn = false, polls = 0;
  const sent: unknown[] = [];
  await page.route("**/api/chat**", async (route) => {
    const url = new URL(route.request().url()), path = url.pathname.replace(/^.*\/api\/chat/, "");
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "") return json({ hosts: [host(signedIn ? ana : null)], repos: [repo] });
    if (path === "/signin") return json({ host: "github", server: "github.com", code: "AB12-CD34", url: "https://github.com/login/device", fullUrl: "https://github.com/login/device", expires: Date.now() + 900_000 });
    if (path === "/signin/poll") { polls++; signedIn = true; return json({ state: "done", me: ana }); }
    if (path === "/threads") return json({ threads: [thread], note: "" });
    if (path === "/thread") return json({ ...thread, messages: [
      { id: "post", author: ben, at: "2026-01-02T00:00:00Z", body: "The **search** takes seconds." },
      { id: "1", author: ana, at: new Date(Date.now() - 120_000).toISOString(), body: "On it. See [the bit](/basics/bit.md)." }] });
    if (path === "/reply") { sent.push(route.request().postDataJSON()); return json({ id: "2", author: ana, at: new Date().toISOString(), body: "Thanks" }); }
    return json({ error: "no" }, 404);
  });
  await page.goto("#/n/basics/bit");
  await toIso(page);
  await page.getByRole("button", { name: "Chat" }).click();
  const chat = page.getByLabel("Chat", { exact: true });
  await expect(chat.getByText("ana/proj")).toBeVisible();

  await chat.getByRole("button", { name: "Sign in to GitHub" }).click();
  await expect(chat.getByLabel("Your code")).toHaveText("AB12-CD34");
  // The code approved, the threads stand.
  const row = chat.getByRole("button", { name: /Search is slow/ });
  await expect(row).toBeVisible({ timeout: 15_000 });
  expect(polls).toBeGreaterThan(0);
  await expect(row).toContainText("issue #3");

  await row.click();
  const log = chat.getByRole("log", { name: "Messages" });
  await expect(log.locator("article")).toHaveCount(2);
  await expect(log.locator("article").first().locator("strong")).toHaveText("search");
  await expect(log.locator("article").nth(1)).toContainText("@ana");
  await expect(log.locator("article").nth(1).locator("time")).toHaveText("2m");
  // Nothing is sent but by the press, and the button says where it goes.
  const reply = chat.getByRole("textbox", { name: "Reply" });
  await reply.fill("Thanks");
  await reply.press("Enter");
  expect(sent).toEqual([]);
  await expect(chat.getByText("ana/proj#3")).toBeVisible();
  await chat.getByRole("button", { name: "Send" }).click();
  await expect(log.locator("article")).toHaveCount(3);
  expect(sent).toEqual([{ host: "github", server: "github.com", repo: "ana/proj", kind: "issue", number: 3, text: "Thanks" }]);
  await expect(reply).toHaveValue("");
});

test("a project with no GitHub or GitLab remote says so", async ({ page }) => {
  await page.route("**/api/chat", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ hosts: [], repos: [] }) }));
  await page.goto("#/n/basics/bit");
  await toIso(page);
  await page.getByRole("button", { name: "Chat" }).click();
  await expect(page.getByText("has no GitHub or GitLab remote")).toBeVisible();
});
