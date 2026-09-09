/**
 * promptfoo custom provider: talks to the DEPLOYED /api/llm adapter exactly the way ElevenLabs
 * does, so an eval exercises the real prompt, the real guard and the real provider routing rather
 * than a re-implementation. One instance per LLM arm; `config.llm` selects the arm server-side.
 *
 * Env: EVAL_BASE_URL (default http://localhost:3000), LLM_ADAPTER_SECRET.
 * The X-Eval-Channel header tells the adapter this is an eval: it must not write session rows,
 * must not count against the visitor caps, and must still run the guard.
 */

class AdapterProvider {
  constructor(options = {}) {
    this.providerId = options.id || "adapter";
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context = {}) {
    const base = (process.env.EVAL_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
    const secret = process.env.LLM_ADAPTER_SECRET;
    if (!secret) {
      return {
        error: "LLM_ADAPTER_SECRET is not set; refusing to run an eval against the adapter",
      };
    }

    const vars = context.vars || {};
    const history = Array.isArray(vars.history) ? vars.history : [];
    const messages = [
      // messages[0] is the agent prompt placeholder, byte-identical to what ElevenLabs sends.
      { role: "system", content: "ABDO_CORPUS_PLACEHOLDER" },
      ...history,
      { role: "user", content: prompt },
    ];

    const started = Date.now();
    let response;
    try {
      response = await fetch(`${base}/api/llm/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Agent-Key": secret,
          "X-Conversation-Id": `eval-${context.testIdx ?? 0}-${started}`,
          "X-Eval-Channel": this.config.suite || "eval",
        },
        body: JSON.stringify({
          model: "portfolio-brain-v1",
          messages,
          stream: false,
          max_tokens: this.config.maxTokens ?? 220,
          // Read by the adapter to pin the arm under test; ignored in production.
          eval_llm: this.config.llm,
          eval_locale: vars.locale || "en",
        }),
      });
    } catch (err) {
      return { error: `adapter unreachable: ${err.message}` };
    }

    if (!response.ok) {
      return { error: `adapter returned ${response.status}: ${await response.text()}` };
    }

    const body = await response.json();
    const choice = (body.choices && body.choices[0]) || {};
    const message = choice.message || {};

    return {
      output: message.content || "",
      tokenUsage: {
        prompt: body.usage?.prompt_tokens,
        completion: body.usage?.completion_tokens,
        total: body.usage?.total_tokens,
        cached: body.usage?.prompt_cache_hit_tokens,
      },
      metadata: {
        latencyMs: Date.now() - started,
        finishReason: choice.finish_reason,
        toolCalls: message.tool_calls || [],
        guardHits: body.x_guard_hits ?? 0,
        llm: body.x_llm_provider,
      },
    };
  }
}

module.exports = AdapterProvider;
