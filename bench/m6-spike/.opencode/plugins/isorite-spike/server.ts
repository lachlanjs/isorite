import { Plugin } from "@opencode/plugin"
import { Schema } from "effect"
import path from "node:path"
import { appendFileSync } from "node:fs"

const log = (m: string) => appendFileSync("/tmp/isorite-spike.log", m + "\n")

export default Plugin.define({
  id: "isorite.spike",
  async setup(ctx) {
    log("server setup " + ctx.location.directory)
    await ctx.tool.transform((tools) => {
      tools.add({
        name: "isorite_search",
        options: { codemode: false },
        description: "Search the isorite knowledge base (notes/) by keyword. Returns the notes found.",
        input: Schema.Struct({ query: Schema.String }),
        output: Schema.Struct({ found: Schema.Number }),
        execute: async ({ query }) => ({
          output: { found: 2 },
          content:
            "Notes found for \"" + query + "\":\n\n```isorite\n" +
            JSON.stringify({ kind: "found", items: [{ title: "the dmft loop", how: "keyword", used: true }, { title: "weiss field", how: "requires", used: false }] }) +
            "\n```\n",
        }),
      })
      tools.add({
        name: "isorite_propose",
        options: { codemode: false },
        description: "Propose an edit to a note. Proposals wait to be kept by the person.",
        input: Schema.Struct({ path: Schema.String, content: Schema.optionalKey(Schema.String), oldString: Schema.optionalKey(Schema.String), newString: Schema.optionalKey(Schema.String) }),
        output: Schema.Struct({ waiting: Schema.Boolean }),
        execute: async (input) => {
          log("proposal " + JSON.stringify(input))
          return { output: { waiting: true }, content: `The edit to ${input.path} was entered as a proposal. It waits to be kept by the person; the file is unchanged.` }
        },
      })
    })
    await ctx.tool.hook("execute.before", async (event) => {
      log("before " + event.tool + " " + JSON.stringify(event.input))
      if (event.tool !== "write" && event.tool !== "edit") return
      const p = (event.input as any)?.path
      if (typeof p !== "string") return
      const rel = path.relative(path.join(ctx.location.directory, "notes"), path.resolve(ctx.location.directory, p))
      if (rel.startsWith("..") || path.isAbsolute(rel)) return
      event.tool = "isorite_propose"
    })
  },
})
