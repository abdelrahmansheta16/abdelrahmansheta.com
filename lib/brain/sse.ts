/**
 * OpenAI Chat-Completions SSE encoder. ElevenLabs' custom-LLM integration speaks exactly this wire
 * format, so /api/llm re-serialises every guarded sentence through here. Pure string building: no I/O,
 * no globals, deterministic output for a fixed id/created pair (which is what the golden test pins).
 */

export interface SseEncoderOptions {
  /** Completion id, e.g. `chatcmpl-…`. Stable for the whole response. */
  id: string;
  /** Model name echoed back to the caller. */
  model: string;
  /** Unix seconds. Defaults to now, injected in tests. */
  created?: number;
}

export type SseFinishReason = "stop" | "tool_calls" | "length" | "content_filter";

export interface SseToolCallDelta {
  index: number;
  id: string;
  name: string;
  arguments: string;
}

export interface SseEncoder {
  /** First chunk: announces the assistant role with no content. */
  start(): string;
  /** One content delta. */
  text(delta: string): string;
  /** One tool-call delta. Emitted whole (id + name + arguments) in a single chunk. */
  toolCall(call: SseToolCallDelta): string;
  /** Terminal chunk carrying `finish_reason`. */
  finish(reason: SseFinishReason): string;
  /** The `data: [DONE]` sentinel. Always the last thing on the wire. */
  done(): string;
}

interface ChunkChoiceDelta {
  role?: "assistant";
  content?: string;
  tool_calls?: Array<{
    index: number;
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

function line(opts: Required<SseEncoderOptions>, delta: ChunkChoiceDelta, finish: string | null): string {
  const payload = {
    id: opts.id,
    object: "chat.completion.chunk",
    created: opts.created,
    model: opts.model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function createSseEncoder(options: SseEncoderOptions): SseEncoder {
  const opts: Required<SseEncoderOptions> = {
    id: options.id,
    model: options.model,
    created: options.created ?? Math.floor(Date.now() / 1000),
  };

  return {
    start: () => line(opts, { role: "assistant", content: "" }, null),
    text: (delta) => line(opts, { content: delta }, null),
    toolCall: (call) =>
      line(
        opts,
        {
          tool_calls: [
            {
              index: call.index,
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: call.arguments },
            },
          ],
        },
        null,
      ),
    finish: (reason) => line(opts, {}, reason),
    done: () => "data: [DONE]\n\n",
  };
}
