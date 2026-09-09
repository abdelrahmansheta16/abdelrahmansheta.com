/**
 * ElevenLabsVoiceSession maps SDK callbacks onto the transport-neutral VoiceSession events. The SDK is
 * mocked so this asserts our wiring, not ElevenLabs'.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElevenLabsVoiceSession } from "@/lib/voice/elevenlabs";
import type { SessionGrant, TranscriptEvent, VoiceMode, VoiceStatus } from "@/lib/voice/VoiceSession";

type Handlers = Record<string, (...args: unknown[]) => unknown>;

const captured: { options: Record<string, unknown> | null } = { options: null };
const conversation = {
  endSession: vi.fn(async () => undefined),
  setMicMuted: vi.fn(),
  getInputVolume: vi.fn(() => 0.42),
  getOutputVolume: vi.fn(() => 0.13),
  sendUserMessage: vi.fn(),
  sendContextualUpdate: vi.fn(),
  sendUserActivity: vi.fn(),
};

vi.mock("@elevenlabs/client", () => ({
  Conversation: {
    startSession: vi.fn(async (options: Record<string, unknown>) => {
      captured.options = options;
      return conversation;
    }),
  },
}));

const GRANT: SessionGrant = {
  provider: "elevenlabs",
  sessionId: "sess_1",
  token: "tok_1",
  maxSeconds: 240,
  expiresAt: "2026-09-09T00:04:00.000Z",
};

const fakeMic = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;

function handlers(): Handlers {
  if (!captured.options) throw new Error("startSession was never called");
  return captured.options as unknown as Handlers;
}

describe("ElevenLabsVoiceSession", () => {
  beforeEach(() => {
    captured.options = null;
    vi.clearAllMocks();
  });

  it("starts a WebRTC session with the minted token and every client tool", async () => {
    const session = new ElevenLabsVoiceSession();
    const statuses: VoiceStatus[] = [];
    session.on("status", (s) => statuses.push(s));
    await session.start(GRANT, { locale: "ar", mic: fakeMic, tools: {} });

    const options = captured.options;
    expect(options?.conversationToken).toBe("tok_1");
    expect(options?.connectionType).toBe("webrtc");
    expect(options?.dynamicVariables).toEqual({ session_id: "sess_1", locale: "ar" });
    expect(options?.overrides).toEqual({ agent: { language: "ar" } });
    expect(Object.keys(options?.clientTools as object)).toContain("show_project");
    expect(statuses).toContain("connecting");
  });

  it("maps status and mode callbacks", async () => {
    const session = new ElevenLabsVoiceSession();
    const statuses: VoiceStatus[] = [];
    const modes: VoiceMode[] = [];
    session.on("status", (s) => statuses.push(s));
    session.on("mode", (m) => modes.push(m));
    await session.start(GRANT, { locale: "en", mic: fakeMic, tools: {} });

    handlers().onStatusChange({ status: "connected" });
    handlers().onStatusChange({ status: "disconnecting" });
    handlers().onModeChange({ mode: "speaking" });
    handlers().onModeChange({ mode: "listening" });

    expect(statuses).toEqual(["connecting", "connected"]);
    expect(modes).toEqual(["speaking", "listening"]);
  });

  it("maps messages to transcript events and tags the language by script", async () => {
    const session = new ElevenLabsVoiceSession();
    const events: TranscriptEvent[] = [];
    session.on("transcript", (event) => events.push(event));
    await session.start(GRANT, { locale: "en", mic: fakeMic, tools: {} });

    handlers().onMessage({ message: "أنا عملت deploy للـ backend بتاع كرافيت", role: "agent", source: "ai" });
    handlers().onMessage({ message: "Where can you work?", role: "user", source: "user" });

    expect(events[0]).toMatchObject({ role: "agent", lang: "ar", final: true });
    expect(events[1]).toMatchObject({ role: "user", lang: "en", final: true });
  });

  it("turns a client tool call into a toolCall event whose respond() resolves the SDK promise", async () => {
    const session = new ElevenLabsVoiceSession();
    session.on("toolCall", (call) => call.respond(`ack:${call.name}`));
    await session.start(GRANT, { locale: "en", mic: fakeMic, tools: {} });

    const clientTools = captured.options?.clientTools as Record<string, (p: unknown) => Promise<string>>;
    await expect(clientTools.show_project({ slug: "rafeeq" })).resolves.toBe("ack:show_project");
  });

  it("emits ended exactly once and forwards the control methods", async () => {
    const session = new ElevenLabsVoiceSession();
    const ended: { reason: string }[] = [];
    session.on("ended", (info) => ended.push(info));
    await session.start(GRANT, { locale: "en", mic: fakeMic, tools: {} });

    session.setMuted(true);
    session.sendText("hello");
    session.sendContext("greeting played");
    session.interrupt();
    expect(conversation.setMicMuted).toHaveBeenCalledWith(true);
    expect(conversation.sendUserMessage).toHaveBeenCalledWith("hello");
    expect(conversation.sendContextualUpdate).toHaveBeenCalledWith("greeting played");
    expect(conversation.sendUserActivity).toHaveBeenCalled();
    expect(session.getInputLevel()).toBeCloseTo(0.42);
    expect(session.getOutputLevel()).toBeCloseTo(0.13);

    await session.end("user");
    handlers().onDisconnect({ reason: "agent" });
    expect(ended).toHaveLength(1);
    expect(ended[0]?.reason).toBe("user");
    expect(session.getInputLevel()).toBe(0);
  });

  it("surfaces an SDK error as an error event and a failed start", async () => {
    const session = new ElevenLabsVoiceSession(async () => {
      throw new Error("token rejected");
    });
    const errors: Error[] = [];
    session.on("error", (error) => errors.push(error));
    await expect(session.start(GRANT, { locale: "en", mic: fakeMic, tools: {} })).rejects.toThrow("token rejected");
    expect(errors[0]?.message).toBe("token rejected");
  });
});
