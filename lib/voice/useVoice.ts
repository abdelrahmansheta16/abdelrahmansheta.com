"use client";
/**
 * The one-tap voice flow. The order inside the click handler is load bearing and must not be reordered:
 * classify the in-app browser, take the microphone, unlock audio playback, and only THEN mint a paid
 * session token (invariant 6 — no paid token before a live mic track exists), then connect.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/lib/tools/schema";
import type {
  SessionGrant,
  ToolCallEvent,
  TranscriptEvent,
  VoiceMode,
  VoiceSession,
  VoiceStatus,
} from "@/lib/voice/VoiceSession";
import { NullVoiceSession, NullVoiceSessionError } from "@/lib/voice/null";
import { ElevenLabsVoiceSession } from "@/lib/voice/elevenlabs";
import { classifyUa, hasMediaDevices, osVersion, type UaClass } from "@/lib/client/inapp";
import { postProbe, postVoiceSession, type ApiReason } from "@/lib/client/api";

/** 45 s with nothing said in either direction ends the call rather than billing silence. */
const SILENCE_MS = 45_000;
/** The greeting has to be audible quickly or iOS ate it (ElevenLabs issue #777). */
const GREETING_WINDOW_MS = 6_000;

export function voiceEnabled(): boolean {
  return process.env.NEXT_PUBLIC_VOICE_ENABLED === "1";
}

let audioContext: AudioContext | null = null;
let silentAudio: HTMLAudioElement | null = null;

/** ~0.05 s of silence. Playing it inside the gesture is what makes the agent's greeting audible on iOS. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

/**
 * One AudioContext per page, created or resumed inside the user gesture, plus a silent element play()
 * so iOS Safari counts the page as having user-initiated audio before the agent's first message.
 */
async function unlockAudio(): Promise<void> {
  const Ctor: typeof AudioContext | undefined =
    typeof window === "undefined"
      ? undefined
      : window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctor) {
    audioContext ??= new Ctor();
    if (audioContext.state === "suspended") await audioContext.resume().catch(() => undefined);
  }
  if (typeof Audio !== "undefined") {
    silentAudio ??= new Audio(SILENT_WAV);
    await silentAudio.play().catch(() => undefined);
  }
}

export interface UseVoiceOptions {
  locale: Locale;
  onTranscript: (event: TranscriptEvent) => void;
  onToolCall: (event: ToolCallEvent) => void;
  onEnded?: (info: { reason: string; durationSec: number }) => void;
}

export interface UseVoiceApi {
  status: VoiceStatus;
  mode: VoiceMode;
  muted: boolean;
  /** Seconds left on the client hard timer, or null before a session exists. */
  remainingSeconds: number | null;
  /** True once the agent's first transcript landed inside the greeting window. */
  greetingPlayed: boolean;
  /** Set when voice is off or capped, so the console can show the right line. */
  blockedReason: ApiReason | null;
  /** Set when the microphone is unreachable from an embedded webview. */
  inAppBrowser: UaClass | null;
  dismissInAppSheet: () => void;
  start: () => Promise<void>;
  end: (reason?: string) => Promise<void>;
  toggleMute: () => void;
  sendText: (text: string) => void;
  sendContext: (note: string) => void;
  interrupt: () => void;
  getInputLevel: () => number;
  getOutputLevel: () => number;
}

export function useVoice({ locale, onTranscript, onToolCall, onEnded }: UseVoiceOptions): UseVoiceApi {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [mode, setMode] = useState<VoiceMode>("listening");
  const [muted, setMuted] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [greetingPlayed, setGreetingPlayed] = useState(false);
  const [blockedReason, setBlockedReason] = useState<ApiReason | null>(null);
  const [inAppBrowser, setInAppBrowser] = useState<UaClass | null>(null);

  const sessionRef = useRef<VoiceSession | null>(null);
  const hardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectedAt = useRef(0);
  const callbacks = useRef<Pick<UseVoiceOptions, "onTranscript" | "onToolCall" | "onEnded">>({
    onTranscript,
    onToolCall,
    onEnded,
  });
  useEffect(() => {
    callbacks.current = { onTranscript, onToolCall, onEnded };
  }, [onTranscript, onToolCall, onEnded]);

  const clearTimers = useCallback(() => {
    for (const ref of [hardTimer, silenceTimer]) {
      if (ref.current) clearTimeout(ref.current);
      ref.current = null;
    }
    if (tickTimer.current) clearInterval(tickTimer.current);
    tickTimer.current = null;
  }, []);

  const end = useCallback(
    async (reason = "user") => {
      clearTimers();
      const session = sessionRef.current;
      sessionRef.current = null;
      setRemainingSeconds(null);
      if (session) await session.end(reason);
      else setStatus("ended");
    },
    [clearTimers],
  );

  useEffect(() => () => void end("unmount"), [end]);

  const armSilence = useCallback(() => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    silenceTimer.current = setTimeout(() => void end("silence"), SILENCE_MS);
  }, [end]);

  const start = useCallback(async () => {
    if (sessionRef.current) return;
    setBlockedReason(null);
    setGreetingPlayed(false);

    // 1. Which browser are we actually inside? Classify, never block.
    const ua = classifyUa(typeof navigator === "undefined" ? null : navigator.userAgent);
    const os = osVersion(typeof navigator === "undefined" ? null : navigator.userAgent);

    if (!voiceEnabled()) {
      // The null transport is the single place that says "there is no voice here".
      const nullSession = new NullVoiceSession("voice_unavailable");
      const unsub = nullSession.on("error", () => setStatus("error"));
      await nullSession
        .start({} as SessionGrant, { locale, mic: null as unknown as MediaStream, tools: {} })
        .catch((cause: unknown) => {
          setBlockedReason(cause instanceof NullVoiceSessionError ? cause.reason : "voice_unavailable");
        });
      unsub();
      return;
    }

    // 2. Microphone first — before any paid call.
    if (!hasMediaDevices()) {
      setInAppBrowser(ua);
      setStatus("error");
      void postProbe({ ua_class: ua, os_version: os, outcome: "unsupported" });
      return;
    }
    setStatus("requesting_mic");
    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (cause) {
      const denied = cause instanceof Error && cause.name === "NotAllowedError";
      setInAppBrowser(ua);
      setStatus("error");
      void postProbe({ ua_class: ua, os_version: os, outcome: denied ? "denied" : "error" });
      return;
    }
    void postProbe({ ua_class: ua, os_version: os, outcome: "granted" });

    // 3. Unlock playback inside the same gesture, so the agent's greeting is audible on iOS.
    await unlockAudio();

    // 4. Only now is it fair to spend money.
    setStatus("connecting");
    const grantResult = await postVoiceSession(locale);
    if (!grantResult.ok) {
      for (const track of mic.getTracks()) track.stop();
      setBlockedReason(grantResult.reason);
      setStatus("error");
      return;
    }
    const grant = grantResult.value;

    // 5. Connect.
    const session = new ElevenLabsVoiceSession();
    sessionRef.current = session;
    session.on("status", setStatus);
    session.on("mode", setMode);
    session.on("transcript", (event) => {
      if (event.role === "agent" && Date.now() - connectedAt.current <= GREETING_WINDOW_MS) setGreetingPlayed(true);
      armSilence();
      callbacks.current.onTranscript(event);
    });
    session.on("toolCall", (event) => callbacks.current.onToolCall(event));
    session.on("error", () => setStatus("error"));
    session.on("ended", (info) => {
      clearTimers();
      sessionRef.current = null;
      setRemainingSeconds(null);
      callbacks.current.onEnded?.(info);
    });

    try {
      await session.start(grant, { locale, mic, tools: {} });
    } catch {
      sessionRef.current = null;
      for (const track of mic.getTracks()) track.stop();
      setStatus("error");
      return;
    }

    // Client-side hard stop, independent of the server's own cap.
    setRemainingSeconds(grant.maxSeconds);
    const startedAt = Date.now();
    connectedAt.current = startedAt;
    tickTimer.current = setInterval(() => {
      const left = grant.maxSeconds - Math.floor((Date.now() - startedAt) / 1000);
      setRemainingSeconds(left > 0 ? left : 0);
    }, 1000);
    hardTimer.current = setTimeout(() => void end("max_seconds"), grant.maxSeconds * 1000);
    armSilence();
  }, [armSilence, clearTimers, end, locale]);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      sessionRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const sendText = useCallback((text: string) => sessionRef.current?.sendText(text), []);
  const sendContext = useCallback((note: string) => sessionRef.current?.sendContext(note), []);
  const interrupt = useCallback(() => sessionRef.current?.interrupt(), []);
  const getInputLevel = useCallback(() => sessionRef.current?.getInputLevel() ?? 0, []);
  const getOutputLevel = useCallback(() => sessionRef.current?.getOutputLevel() ?? 0, []);
  const dismissInAppSheet = useCallback(() => setInAppBrowser(null), []);

  return useMemo(
    () => ({
      status,
      mode,
      muted,
      remainingSeconds,
      greetingPlayed,
      blockedReason,
      inAppBrowser,
      dismissInAppSheet,
      start,
      end,
      toggleMute,
      sendText,
      sendContext,
      interrupt,
      getInputLevel,
      getOutputLevel,
    }),
    [
      blockedReason,
      dismissInAppSheet,
      end,
      getInputLevel,
      getOutputLevel,
      greetingPlayed,
      inAppBrowser,
      interrupt,
      mode,
      muted,
      remainingSeconds,
      sendContext,
      sendText,
      start,
      status,
      toggleMute,
    ],
  );
}
