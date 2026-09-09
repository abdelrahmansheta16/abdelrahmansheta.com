/**
 * VoiceSession over @elevenlabs/client 1.24.0 (WebRTC, conversation token minted server side).
 * Everything ElevenLabs-shaped stops here: the console only ever sees the VoiceSession events.
 * The SDK module is imported dynamically so the ~100 kB client is not in the first-load bundle.
 */
import type {
  SessionGrant,
  ToolCallEvent,
  ToolHandlers,
  Unsub,
  VoiceSession,
  VoiceSessionEvents,
  VoiceStatus,
} from "@/lib/voice/VoiceSession";
import type { Locale, ToolName } from "@/lib/tools/schema";
import { TOOL_NAMES } from "@/lib/tools/schema";
import { detectLocale } from "@/lib/client/lang";
import { VoiceEmitter } from "@/lib/voice/emitter";

/** The subset of the SDK conversation object this adapter uses. */
export interface ConversationLike {
  endSession(): Promise<void>;
  setMicMuted(isMuted: boolean): void;
  getInputVolume(): number;
  getOutputVolume(): number;
  sendUserMessage(text: string): void;
  sendContextualUpdate(text: string): void;
  sendUserActivity(): void;
}

type StartSessionOptions = Record<string, unknown>;

/** Injectable for tests; in the browser this resolves to the real SDK. */
export type ConversationLoader = () => Promise<{
  startSession(options: StartSessionOptions): Promise<ConversationLike>;
}>;

const defaultLoader: ConversationLoader = async () => {
  const mod = await import("@elevenlabs/client");
  return {
    startSession: (options: StartSessionOptions) =>
      mod.Conversation.startSession(options as Parameters<typeof mod.Conversation.startSession>[0]),
  };
};

function mapStatus(status: string): VoiceStatus | null {
  switch (status) {
    case "connecting":
      return "connecting";
    case "connected":
      return "connected";
    case "disconnected":
      return "ended";
    default:
      return null; // "disconnecting" is a transient the console does not need
  }
}

function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

export class ElevenLabsVoiceSession implements VoiceSession {
  private readonly emitter = new VoiceEmitter();
  private conversation: ConversationLike | null = null;
  private mic: MediaStream | null = null;
  private startedAt = 0;
  private ending = false;

  constructor(private readonly load: ConversationLoader = defaultLoader) {}

  async start(grant: SessionGrant, opts: { locale: Locale; mic: MediaStream; tools: ToolHandlers }): Promise<void> {
    this.mic = opts.mic;
    this.startedAt = Date.now();
    this.emitter.emit("status", "connecting");

    const clientTools: Record<string, (parameters: unknown) => Promise<string>> = {};
    for (const name of TOOL_NAMES) {
      clientTools[name] = (parameters: unknown) =>
        new Promise<string>((resolve) => {
          const event: ToolCallEvent = { name, args: parameters, respond: resolve };
          this.emitter.emit("toolCall", event);
          // A handler that never responds must not wedge the agent's turn.
          setTimeout(() => resolve("no_response"), 4000);
        });
    }

    try {
      const sdk = await this.load();
      this.conversation = await sdk.startSession({
        conversationToken: grant.token,
        connectionType: "webrtc",
        clientTools,
        dynamicVariables: { session_id: grant.sessionId, locale: opts.locale },
        overrides: { agent: { language: opts.locale } },
        onModeChange: ({ mode }: { mode: string }) => {
          this.emitter.emit("mode", mode === "speaking" ? "speaking" : "listening");
        },
        onStatusChange: ({ status }: { status: string }) => {
          const mapped = mapStatus(status);
          if (mapped) this.emitter.emit("status", mapped);
        },
        onMessage: ({ message, role, source }: { message: string; role?: string; source?: string }) => {
          const who = role ?? source;
          this.emitter.emit("transcript", {
            role: who === "user" ? "user" : "agent",
            text: message,
            lang: message.trim().length === 0 ? "unknown" : detectLocale(message),
            final: true,
          });
          // ElevenLabs has no "thinking" mode; the gap after a final user turn is exactly that.
          if (who === "user") this.emitter.emit("mode", "thinking");
        },
        onAgentResponseCorrection: ({ corrected_agent_response }: { corrected_agent_response?: string }) => {
          if (!corrected_agent_response) return;
          this.emitter.emit("transcript", {
            role: "agent",
            text: corrected_agent_response,
            lang: detectLocale(corrected_agent_response),
            final: true,
            corrected: true,
          });
        },
        onUnhandledClientToolCall: (params: { tool_name?: string }) => {
          const name = params.tool_name;
          if (name && !isToolName(name)) {
            this.emitter.emit("error", new Error(`unknown client tool: ${name}`));
          }
        },
        onError: (message: string) => {
          this.emitter.emit("error", new Error(message));
          this.emitter.emit("status", "error");
        },
        onDisconnect: (details: { reason?: string }) => {
          this.finish(details?.reason ?? "agent");
        },
      });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      this.emitter.emit("error", error);
      this.emitter.emit("status", "error");
      this.releaseMic();
      throw error;
    }
  }

  private releaseMic(): void {
    for (const track of this.mic?.getTracks() ?? []) track.stop();
    this.mic = null;
  }

  private finish(reason: string): void {
    if (this.ending) return;
    this.ending = true;
    const durationSec = this.startedAt === 0 ? 0 : Math.round((Date.now() - this.startedAt) / 1000);
    this.releaseMic();
    this.conversation = null;
    this.emitter.emit("ended", { reason, durationSec });
    this.emitter.emit("status", "ended");
  }

  async end(reason = "user"): Promise<void> {
    const conversation = this.conversation;
    if (conversation) {
      try {
        await conversation.endSession();
      } catch (cause) {
        this.emitter.emit("error", cause instanceof Error ? cause : new Error(String(cause)));
      }
    }
    this.finish(reason);
  }

  sendText(text: string): void {
    this.conversation?.sendUserMessage(text);
  }

  sendContext(note: string): void {
    this.conversation?.sendContextualUpdate(note);
  }

  interrupt(): void {
    this.conversation?.sendUserActivity();
  }

  setMuted(muted: boolean): void {
    this.conversation?.setMicMuted(muted);
  }

  getInputLevel(): number {
    return this.conversation?.getInputVolume() ?? 0;
  }

  getOutputLevel(): number {
    return this.conversation?.getOutputVolume() ?? 0;
  }

  on<E extends keyof VoiceSessionEvents>(event: E, handler: VoiceSessionEvents[E]): Unsub {
    return this.emitter.on(event, handler);
  }
}
