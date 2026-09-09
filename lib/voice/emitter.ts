/** Tiny typed event emitter shared by the VoiceSession implementations. No dependencies on purpose. */
import type { Unsub, VoiceSessionEvents } from "@/lib/voice/VoiceSession";

type Handlers = { [E in keyof VoiceSessionEvents]: Set<VoiceSessionEvents[E]> };

export class VoiceEmitter {
  private readonly handlers: Handlers = {
    status: new Set(),
    mode: new Set(),
    transcript: new Set(),
    toolCall: new Set(),
    ended: new Set(),
    error: new Set(),
  };

  on<E extends keyof VoiceSessionEvents>(event: E, handler: VoiceSessionEvents[E]): Unsub {
    const set = this.handlers[event] as Set<VoiceSessionEvents[E]>;
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  emit<E extends keyof VoiceSessionEvents>(event: E, ...args: Parameters<VoiceSessionEvents[E]>): void {
    const set = this.handlers[event] as Set<VoiceSessionEvents[E]>;
    for (const handler of [...set]) {
      // A listener that throws must not take the transport down with it.
      try {
        (handler as (...a: Parameters<VoiceSessionEvents[E]>) => void)(...args);
      } catch {
        /* listener errors are the listener's problem */
      }
    }
  }

  clear(): void {
    for (const key of Object.keys(this.handlers) as (keyof VoiceSessionEvents)[]) {
      this.handlers[key].clear();
    }
  }
}
