/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui"
import { TextRenderable } from "@opentui/core"
import { appendFileSync } from "node:fs"

const log = (m: string) => appendFileSync("/tmp/isorite-spike.log", m + "\n")

export default Plugin.define({
  id: "isorite.spike",
  setup(ctx) {
    log("tui setup")
    ctx.ui.router.register({ name: "isorite-splash", render: () => (
      <box flexDirection="column" alignItems="center" justifyContent="center" width="100%" height="100%">
        <text fg={ctx.theme.text.base}>  ▄▀▄  </text><text fg={ctx.theme.text.base}>i s o r i t e</text>
        <text fg={ctx.theme.text.muted}>spike · 1 note</text>
        <text>[enter] open   [q] quit</text>
      </box>
    ) })
    setTimeout(() => ctx.ui.router.navigate({ type: "plugin", name: "isorite-splash", data: {} }), 0)
    ctx.ui.slot({ append: "sidebar.content", render: () => (
      <box flexDirection="column" border borderStyle="rounded" title="notes in play">
        <text>1 the dmft loop</text>
        <text fg={ctx.theme.text.muted}>· mott transition   not used</text>
      </box>
    ) })
    ctx.ui.slot({ append: "prompt.footer.status", render: () => <text fg={ctx.theme.text.muted}>◆ atlas following</text> })
    ctx.ui.slot({ append: "session.panel", render: (input) => input.name !== "isorite-atlas" ? null : (
      <box flexDirection="column" width="100%"><text>atlas · the dmft loop  (w={input.width})</text><text>┌──────────┐   ┌──────────┐</text><text>│weiss fld │──▶│ dmft loop│</text><text>└──────────┘   └──────────┘</text></box>
    ) })
    ctx.ui.router.register({ name: "isorite-note", render: (input) => (
      <box flexDirection="column" padding={1}><text>dmft / the dmft loop</text><text>◇ Mix the bath.</text><text fg={ctx.theme.text.muted}>[t] timeline  [q] back</text></box>
    ) })
    ctx.markdown.registerCodeBlockRenderer("isorite", (token) => {
      let data: any = {}
      try { data = JSON.parse(token.text) } catch {}
      const lines = (data.items ?? []).map((i: any, n: number, a: any[]) => `${n === a.length - 1 ? "└─" : "├─"} ${i.title}   ${i.how}   ${i.used ? "◆ used" : "not used"}`)
      return new TextRenderable(ctx.renderer, { content: "notes\n" + lines.join("\n") })
    })
    ctx.ui.slot({ append: "app", render() {
        ctx.keymap.layer(() => ({
          mode: "global",
      commands: [
        { id: "isorite.note", title: "Open a note", palette: true, slash: { name: "note" }, run: () => ctx.ui.router.navigate({ type: "plugin", name: "isorite-note", data: {} }) },
        { id: "isorite.atlas", title: "One-note atlas", palette: true, slash: { name: "atlas" }, run: () => { ctx.ui.panel.open("isorite-atlas", { presentation: "panel" }) } },
      ],
    }))
        return null
      } })
  },
})
