/** Provider adapters over the OpenAI-compatible shape. Area E. DeepSeek direct is primary; Anthropic Haiku 4.5 is failover. */
import type { ProviderAdapter } from "@/lib/brain/types";

export function createDeepSeekProvider(_opts: { apiKey: string; baseUrl?: string; model?: string }): ProviderAdapter {
  throw new Error("createDeepSeekProvider: implemented in area E");
}

export function createAnthropicProvider(_opts: { apiKey: string; model?: string }): ProviderAdapter {
  throw new Error("createAnthropicProvider: implemented in area E");
}

/** Primary with failover on 429/5xx/network/first-token timeout (1.5 s)/content_filter before first byte. */
export function withFailover(_primary: ProviderAdapter, _fallback: ProviderAdapter, _opts?: { firstTokenTimeoutMs?: number }): ProviderAdapter {
  throw new Error("withFailover: implemented in area E");
}
