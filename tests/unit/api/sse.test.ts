/** Golden test for the OpenAI Chat-Completions SSE encoder. ElevenLabs parses these bytes literally,
 *  so the assertion is on the exact wire text, not on a parsed object. */
import { describe, expect, it } from "vitest";
import { createSseEncoder } from "@/lib/brain/sse";

const GOLDEN = [
  'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1750000000,"model":"portfolio-brain-v1","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n',
  'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1750000000,"model":"portfolio-brain-v1","choices":[{"index":0,"delta":{"content":"Hi there."},"finish_reason":null}]}\n\n',
  'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1750000000,"model":"portfolio-brain-v1","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"show_section","arguments":"{\\"section\\":\\"proof\\"}"}}]},"finish_reason":null}]}\n\n',
  'data: {"id":"chatcmpl-test","object":"chat.completion.chunk","created":1750000000,"model":"portfolio-brain-v1","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n',
  "data: [DONE]\n\n",
].join("");

describe("createSseEncoder", () => {
  const encoder = createSseEncoder({ id: "chatcmpl-test", model: "portfolio-brain-v1", created: 1750000000 });

  it("emits the exact chunk sequence a custom-LLM client expects", () => {
    const wire =
      encoder.start() +
      encoder.text("Hi there.") +
      encoder.toolCall({ index: 0, id: "call_1", name: "show_section", arguments: '{"section":"proof"}' }) +
      encoder.finish("tool_calls") +
      encoder.done();
    expect(wire).toBe(GOLDEN);
  });

  it("terminates every line with a blank line so the SSE framing is valid", () => {
    for (const chunk of [encoder.start(), encoder.text("x"), encoder.finish("stop"), encoder.done()]) {
      expect(chunk.startsWith("data: ")).toBe(true);
      expect(chunk.endsWith("\n\n")).toBe(true);
    }
  });

  it("defaults created to now when it is not injected", () => {
    const auto = createSseEncoder({ id: "a", model: "m" });
    const parsed = JSON.parse(auto.text("x").slice("data: ".length)) as { created: number };
    expect(parsed.created).toBeGreaterThan(1_700_000_000);
  });
});
