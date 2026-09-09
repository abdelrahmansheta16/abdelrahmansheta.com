"use client";
/**
 * The AI console: one conversation, two input methods. Mounted once in the hero; it opens on a
 * window CustomEvent('console:open') so the static server-rendered spine can stay a Server Component and
 * still drive it. Right-docked 440 px panel from 1024 px up, a 100dvh bottom sheet below that.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import type { Locale } from "@/lib/tools/schema";
import type { ConsoleCorpus } from "@/components/console/types";
import type { Bilingual } from "@/components/console/strings";
import { reasonCopy, t } from "@/components/console/strings";
import { DEFAULT_CONSENT, DEFAULT_CORPUS, DEFAULT_DISCLOSURE } from "@/components/console/defaults";
import { applyEffect, reduceToolCall } from "@/components/console/effects";
import { chatFetch, getRequestLocale, getSessionId, setRequestLocale } from "@/lib/client/api";
import { detectLocale } from "@/lib/client/lang";
import Orb, { type OrbState } from "@/components/orb/Orb";
import Transcript from "@/components/console/Transcript";
import PromptBar, { type LangPref } from "@/components/console/PromptBar";
import InAppBrowserSheet from "@/components/console/InAppBrowserSheet";
import { useVoice, voiceEnabled } from "@/lib/voice/useVoice";

export interface ConsoleProps {
  locale?: Locale;
  consent?: Bilingual;
  disclosure?: Bilingual;
  corpus?: ConsoleCorpus;
}

export interface ConsoleOpenDetail {
  mode: "voice" | "text";
  prompt?: string;
}

const SESSION_SECONDS = 240;

/** Mirrors the server ceiling in app/api/chat/route.ts. */
const MAX_TOOL_ROUNDS = 3;

function mmss(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds));
  return `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, "0")}`;
}

function newMessage(role: "user" | "assistant", parts: UIMessage["parts"]): UIMessage {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
  return { id, role, parts };
}

function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktop(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return desktop;
}

export default function Console({
  locale: initialLocale = "en",
  consent = DEFAULT_CONSENT,
  disclosure = DEFAULT_DISCLOSURE,
  corpus = DEFAULT_CORPUS,
}: ConsoleProps) {
  const router = useRouter();
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [langPref, setLangPref] = useState<LangPref>("auto");
  const [draft, setDraft] = useState("");
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [offerText, setOfferText] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  /** "Auto" follows whatever the visitor last spoke or typed; a pill pins it. */
  const activeLocale: Locale = langPref === "auto" ? locale : langPref;
  useEffect(() => {
    setRequestLocale(activeLocale);
  }, [activeLocale]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/chat",
        credentials: "same-origin",
        fetch: chatFetch,
        body: () => ({ locale: getRequestLocale(), sessionId: getSessionId() }),
      }),
    [],
  );

  const onLocaleEffect = useCallback(
    (next: Locale) => {
      setLocale(next);
      setLangPref(next);
      router.push(next === "ar" ? "/ar" : "/");
    },
    [router],
  );

  const { messages, sendMessage, setMessages, status, addToolOutput, error } = useChat<UIMessage>({
    transport,
    // Bounded on purpose. The server refuses tools past its own ceiling, which is what actually stops
    // the spend; this keeps the UI from firing pointless round trips before it gets there.
    sendAutomaticallyWhen: ({ messages: history }) => {
      if (!lastAssistantMessageIsCompleteWithToolCalls({ messages: history })) return false;
      let rounds = 0;
      for (let i = history.length - 1; i >= 0; i -= 1) {
        const m = history[i];
        if (m === undefined || m.role === "user") break;
        if (m.role === "assistant" && m.parts.some((p) => p.type.startsWith("tool-"))) rounds += 1;
      }
      return rounds < MAX_TOOL_ROUNDS;
    },
    onToolCall: ({ toolCall }) => {
      const outcome = reduceToolCall(toolCall.toolName, toolCall.input);
      for (const effect of outcome.effects) applyEffect(effect, onLocaleEffect);
      // Not awaited on purpose: awaiting inside onToolCall deadlocks the automatic resubmit.
      void addToolOutput({ tool: toolCall.toolName, toolCallId: toolCall.toolCallId, output: outcome.output });
    },
  });

  const appendVoiceTurn = useCallback(
    (role: "user" | "assistant", text: string) => {
      if (text.trim().length === 0) return;
      setMessages((current) => [...current, newMessage(role, [{ type: "text", text }])]);
    },
    [setMessages],
  );

  const voice = useVoice({
    locale: activeLocale,
    onTranscript: (event) => {
      if (!event.final) return;
      appendVoiceTurn(event.role === "user" ? "user" : "assistant", event.text);
      if (event.lang !== "unknown" && langPref === "auto") setLocale(event.lang);
    },
    onToolCall: (event) => {
      const outcome = reduceToolCall(event.name, event.args);
      for (const effect of outcome.effects) applyEffect(effect, onLocaleEffect);
      setMessages((current) => [
        ...current,
        newMessage("assistant", [
          {
            type: "dynamic-tool",
            toolName: event.name,
            toolCallId: `voice-${Date.now()}`,
            state: "output-available",
            input: event.args,
            output: outcome.output,
          },
        ]),
      ]);
      event.respond(outcome.output);
    },
    onEnded: () => setOfferText(true),
  });

  // Open on the CustomEvent the hero buttons and prompt chips dispatch.
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<ConsoleOpenDetail>).detail;
      setOpen(true);
      setOfferText(false);
      if (detail?.prompt) {
        const text = detail.prompt;
        setLocale(detectLocale(text));
        void sendMessage({ text });
      }
      if (detail?.mode === "voice" && voiceEnabled()) void voice.start();
    };
    window.addEventListener("console:open", onOpen);
    return () => window.removeEventListener("console:open", onOpen);
  }, [sendMessage, voice]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Pin the prompt bar above the on-screen keyboard on mobile.
  useEffect(() => {
    const vv = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!open || !vv) return;
    const sync = () => setKeyboardInset(Math.max(0, window.innerHeight - (vv.height + vv.offsetTop)));
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, [open]);

  // Swipe the sheet down to close.
  const touchStart = useRef<number | null>(null);
  const onTouchStart = (event: React.TouchEvent) => {
    touchStart.current = event.touches[0]?.clientY ?? null;
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchStart.current;
    const end = event.changedTouches[0]?.clientY;
    touchStart.current = null;
    if (start !== null && end !== undefined && end - start > 80) setOpen(false);
  };

  const orbState: OrbState = useMemo(() => {
    if (!voiceEnabled()) return "text-only";
    if (voice.blockedReason === "capped_global" || voice.blockedReason === "capped_visitor") return "capped";
    if (voice.status === "error" || error) return "error";
    if (voice.muted && voice.status === "connected") return "muted";
    if (voice.status === "connecting" || voice.status === "requesting_mic") return "connecting";
    if (voice.status === "connected") {
      if (voice.mode === "speaking") return "speaking";
      if (voice.mode === "thinking") return "thinking";
      return "listening";
    }
    if (status === "submitted" || status === "streaming") return "thinking";
    return "idle";
  }, [error, status, voice.blockedReason, voice.mode, voice.muted, voice.status]);

  const stateLabel = useMemo(() => {
    switch (orbState) {
      case "listening":
        return t("listening", locale);
      case "thinking":
        return t("thinking", locale);
      case "speaking":
        return t("speaking", locale);
      case "connecting":
        return t("connecting", locale);
      case "muted":
        return t("muted", locale);
      case "capped":
        return t("voiceResting", locale);
      case "error":
        return t("ended", locale);
      case "text-only":
        return t("textOnly", locale);
      default:
        return t("idle", locale);
    }
  }, [locale, orbState]);

  const notice = voice.blockedReason ? reasonCopy(voice.blockedReason, locale) : null;
  const voiceActive = voice.status === "connected" || voice.status === "connecting";
  const compactOrb = !desktop && messages.length > 0;

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={t("badge", locale)}
      dir={locale === "ar" ? "rtl" : "ltr"}
      lang={locale}
      style={{ paddingBottom: keyboardInset }}
      className="fixed inset-0 z-50 flex h-[100dvh] flex-col border-black/10 bg-white/95 backdrop-blur lg:inset-y-0 lg:start-auto lg:end-0 lg:h-auto lg:w-[440px] lg:border-s dark:bg-black/90"
    >
      <header
        className="flex items-center gap-3 border-b border-black/10 px-4 py-3 dark:border-white/15"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <Orb
          state={orbState}
          size={compactOrb ? 72 : 120}
          label={stateLabel}
          getInputLevel={voice.getInputLevel}
          getOutputLevel={voice.getOutputLevel}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-wide opacity-60">{t("badge", locale)}</p>
          <p className="truncate text-sm">{stateLabel}</p>
          {voiceActive ? (
            <p className="text-xs tabular-nums opacity-60" aria-label={t("sessionMeter", locale)}>
              <bdi>
                {mmss(voice.remainingSeconds ?? SESSION_SECONDS)} / {mmss(SESSION_SECONDS)}
              </bdi>
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t("close", locale)}
          className="rounded-lg border border-black/15 px-2 py-1 text-xs dark:border-white/20"
        >
          ✕
        </button>
      </header>

      <p className="px-4 py-2 text-[11px] leading-snug opacity-60">{disclosure[locale]}</p>

      <Transcript messages={messages} locale={locale} corpus={corpus} />

      {notice ? <p className="px-4 pb-2 text-xs opacity-70">{notice}</p> : null}
      {offerText ? (
        <p className="px-4 pb-2 text-xs opacity-70">
          {t("ended", locale)} — {t("continueByText", locale)}
        </p>
      ) : null}
      {voice.inAppBrowser ? (
        <InAppBrowserSheet uaClass={voice.inAppBrowser} locale={locale} onDismiss={voice.dismissInAppSheet} />
      ) : null}

      <PromptBar
        locale={locale}
        value={draft}
        onChange={setDraft}
        onSubmit={() => {
          const text = draft.trim();
          setDraft("");
          if (voice.status === "connected") {
            appendVoiceTurn("user", text);
            voice.sendText(text);
            return;
          }
          void sendMessage({ text });
        }}
        disabled={status === "submitted"}
        voiceActive={voiceActive}
        showTalk={!voiceActive}
        onTalk={() => {
          setOfferText(false);
          void voice.start();
        }}
        onEnd={() => void voice.end("user")}
        muted={voice.muted}
        onToggleMute={voice.toggleMute}
        langPref={langPref}
        onLangPref={(pref) => {
          setLangPref(pref);
          if (pref !== "auto") setLocale(pref);
        }}
        consentLine={consent[locale]}
      />

    </div>
  );
}
