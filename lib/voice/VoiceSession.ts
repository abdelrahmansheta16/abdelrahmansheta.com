/**
 * The frontend never imports @elevenlabs/* directly. It talks to this interface so an xAI speech-to-speech
 * session or a LiveKit worker can replace the transport later without UI changes.
 */
import type { Locale, ToolName } from "@/lib/tools/schema";

export type VoiceStatus = "idle" | "requesting_mic" | "connecting" | "connected" | "ended" | "error";
export type VoiceMode = "listening" | "thinking" | "speaking";

export interface SessionGrant {
  provider: "elevenlabs" | "xai" | "livekit";
  sessionId: string;
  token: string;
  url?: string;
  maxSeconds: number;
  expiresAt: string;
}

export interface TranscriptEvent {
  role: "user" | "agent";
  text: string;
  lang: Locale | "unknown";
  final: boolean;
  corrected?: boolean;
}

export interface ToolCallEvent {
  name: ToolName;
  args: unknown;
  respond: (result: string) => void;
}

export type ToolHandlers = Partial<Record<ToolName, (args: unknown) => string | Promise<string>>>;

export interface VoiceSessionEvents {
  status: (s: VoiceStatus) => void;
  mode: (m: VoiceMode) => void;
  transcript: (t: TranscriptEvent) => void;
  toolCall: (c: ToolCallEvent) => void;
  ended: (r: { reason: string; durationSec: number }) => void;
  error: (e: Error) => void;
}

export type Unsub = () => void;

export interface VoiceSession {
  start(grant: SessionGrant, opts: { locale: Locale; mic: MediaStream; tools: ToolHandlers }): Promise<void>;
  end(reason?: string): Promise<void>;
  sendText(text: string): void;
  sendContext(note: string): void;
  interrupt(): void;
  setMuted(muted: boolean): void;
  getInputLevel(): number;
  getOutputLevel(): number;
  on<E extends keyof VoiceSessionEvents>(event: E, handler: VoiceSessionEvents[E]): Unsub;
}
