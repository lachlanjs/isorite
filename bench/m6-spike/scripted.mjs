// A scripted OpenAI-compatible endpoint, standing in for a corporate gateway.
// Each turn looks at the tool results already in the conversation and plays the next step.
import http from "node:http"
const steps = [
  { tool: "isorite_search", args: { query: "mixing" } },
  { tool: "write", args: { path: "notes/the-dmft-loop.md", content: "# The DMFT loop\n\nMix half the old bath.\n" } },
  { text: "The update replaces the bath outright.\n\n```isorite\n{\"kind\":\"found\",\"items\":[{\"title\":\"the dmft loop\",\"how\":\"keyword\",\"used\":true},{\"title\":\"weiss field\",\"how\":\"requires\",\"used\":false}]}\n```\n\nKeep part of the old bath. [1]" },
]
const log = []
http.createServer((req, res) => {
  let body = ""
  req.on("data", (c) => (body += c))
  req.on("end", () => {
    if (req.url.endsWith("/models")) { res.end(JSON.stringify({ data: [{ id: "scripted" }] })); return }
    const json = JSON.parse(body || "{}")
    log.push({ auth: req.headers.authorization, tools: (json.tools ?? []).map((t) => t.function?.name) })
    const done = (json.messages ?? []).filter((m) => m.role === "tool").length
    const step = steps[Math.min(done, steps.length - 1)]
    res.writeHead(200, { "content-type": "text/event-stream" })
    const send = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 0, model: "scripted", choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
    if (step.tool) {
      send({ role: "assistant", tool_calls: [{ index: 0, id: "call_" + done, type: "function", function: { name: step.tool, arguments: JSON.stringify(step.args) } }] })
      send({}, "tool_calls")
    } else {
      send({ role: "assistant", content: step.text })
      send({}, "stop")
    }
    res.write(`data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 0, model: "scripted", choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`)
    res.end("data: [DONE]\n\n")
    console.log(JSON.stringify(log.at(-1)))
  })
}).listen(Number(process.env.PORT ?? 4599), "127.0.0.1")
