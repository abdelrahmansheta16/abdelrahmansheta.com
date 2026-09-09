/**
 * The VoiceSession used whenever voice is off: NEXT_PUBLIC_VOICE_ENABLED is not "1", the provider is
 * unavailable, or the day's cap is spent. start() always rejects, which is what pushes the console into
 * its text-only state with the right copy.
 */
import type {
  SessionGrant,
  ToolHandlers,
  Unsub,
  VoiceSession,
  VoiceSessionEvents,
} from "@/lib/voice/VoiceSession";
import type { Locale } from "@/lib/tools/schema";
import { VoiceEmitter } from "@/lib/voice/emitter";

export type NullReason = "voice_unavailable" | "capped_global" | "capped_visitor" | "killed";

export class NullVoiceSessionError extends Error {
  constructor(readonly reason: NullReason) {
    super(reason);
    this.name = "NullVoiceSessionError";
  }
}

export class NullVoiceSession implements VoiceSession {
  private readonly emitter = new VoiceEmitter();

  constructor(private readonly reason: NullReason = "voice_unavailable") {}

  async start(_grant: SessionGrant, _opts: { locale: Locale; mic: MediaStream; tools: ToolHandlers }): Promise<void> {
    void _grant;
    void _opts;
    const error = new NullVoiceSessionError(this.reason);
    this.emitter.emit("status", "error");
    this.emitter.emit("error", error);
    throw error;
  }

  async end(reason = "null_session"): Promise<void> {
    this.emitter.emit("ended", { reason, durationSec: 0 });
    this.emitter.emit("status", "ended");
  }

  sendText(): void {}
  sendContext(): void {}
  interrupt(): void {}
  setMuted(): void {}
  getInputLevel(): number {
    return 0;
  }
  getOutputLevel(): number {
    return 0;
  }

  on<E extends keyof VoiceSessionEvents>(event: E, handler: VoiceSessionEvents[E]): Unsub {
    return this.emitter.on(event, handler);
  }
}
