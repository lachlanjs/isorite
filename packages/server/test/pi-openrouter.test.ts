// A model OpenRouter lists and pi's catalogue does not yet: built from OpenRouter's own list, on a pi model of the same
// kind; a name neither knows is refused with what to write. The list is stood in for, so nothing is fetched.

import { afterEach, describe, expect, it, vi } from "vitest";
import { modelFor } from "../src/pi/index.ts";
import { forgetOpenRouterList } from "../src/pi/openrouter.ts";

const LIST = { data: [
  { id: "google/gemini-9-test", name: "Google: Gemini 9 Test", context_length: 2_000_000, architecture: { input_modalities: ["text", "image", "audio"] }, top_provider: { max_completion_tokens: 900_000 }, supported_parameters: ["reasoning", "max_tokens"], pricing: { prompt: "0.000002", completion: "0.00001", input_cache_read: "0.0000005" } },
  { id: "anthropic/claude-test-9", name: "Anthropic: Claude Test 9", context_length: 500_000, architecture: { input_modalities: ["text"] }, supported_parameters: [], pricing: { prompt: "0.000003", completion: "0.000015" } },
] };

afterEach(() => { vi.unstubAllGlobals(); forgetOpenRouterList(); });

describe("an OpenRouter model pi does not list", () => {
  it("is built from OpenRouter's list: its size, inputs and prices, a sane answer length, and the way of calling its vendor's", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(LIST)));
    const { chosen } = await modelFor("openrouter", "google/gemini-9-test");
    expect(chosen).toMatchObject({ id: "google/gemini-9-test", name: "Google: Gemini 9 Test", provider: "openrouter", api: "openai-completions", contextWindow: 2_000_000, maxTokens: 64_000, reasoning: true });
    expect(chosen.input).toEqual(["text", "image"]);
    expect(chosen.cost).toMatchObject({ input: 2, output: 10, cacheRead: 0.5 });
    const { chosen: claude } = await modelFor("openrouter", "anthropic/claude-test-9");
    expect(claude.api).toBe("anthropic-messages");
    expect(claude.reasoning).toBe(false);
  });

  it("is refused with what to write where OpenRouter does not list it either", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(LIST)));
    await expect(modelFor("openrouter", "google/not-a-model")).rejects.toThrow(/OpenRouter has no model "google\/not-a-model": it is written as <vendor>\/<model>/);
  });

  it("says why when OpenRouter's list cannot be read, rather than that the model is wrong", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("fetch failed"); });
    await expect(modelFor("openrouter", "google/gemini-9-test2")).rejects.toThrow(/list could not be read.*fetch failed/);
  });

  it("keeps pi's own model where pi has it, and asks nothing", async () => {
    vi.stubGlobal("fetch", async () => { throw new Error("asked"); });
    const { chosen } = await modelFor("openrouter", "anthropic/claude-sonnet-4.5");
    expect(chosen.id).toBe("anthropic/claude-sonnet-4.5");
  });
});
