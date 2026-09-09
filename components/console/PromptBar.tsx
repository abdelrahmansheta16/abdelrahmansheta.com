"use client";
/**
 * The prompt bar. The text input is present in every mode — voice and text share one conversation, so a
 * visitor who cannot talk (open-plan office, a webview with no mic) is never in a dead end. The consent
 * line lives directly above the Talk button rather than in a modal nobody reads.
 */
import type { FormEvent } from "react";
import type { Locale } from "@/lib/tools/schema";
import { t } from "@/components/console/strings";

export type LangPref = "auto" | "en" | "ar";

export interface PromptBarProps {
  locale: Locale;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  voiceActive: boolean;
  showTalk: boolean;
  onTalk: () => void;
  onEnd: () => void;
  muted: boolean;
  onToggleMute: () => void;
  langPref: LangPref;
  onLangPref: (pref: LangPref) => void;
  consentLine: string;
}

const PILLS: ReadonlyArray<{ pref: LangPref; key: "langAuto" | "langEn" | "langAr" }> = [
  { pref: "auto", key: "langAuto" },
  { pref: "en", key: "langEn" },
  { pref: "ar", key: "langAr" },
];

export default function PromptBar(props: PromptBarProps) {
  const { locale } = props;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (props.value.trim().length === 0) return;
    props.onSubmit();
  };

  return (
    <div className="border-t border-black/10 bg-white/80 px-4 pb-[env(safe-area-inset-bottom)] pt-3 backdrop-blur dark:border-white/15 dark:bg-black/60">
      {props.showTalk ? (
        <div className="mb-3">
          <p className="mb-2 text-[11px] leading-snug opacity-60">{props.consentLine}</p>
          <button
            type="button"
            onClick={props.onTalk}
            className="w-full rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 dark:bg-white dark:text-black"
          >
            {t("talk", locale)}
          </button>
        </div>
      ) : null}

      <form onSubmit={submit} className="flex items-end gap-2">
        <label className="sr-only" htmlFor="console-input">
          {t("inputPlaceholder", locale)}
        </label>
        <input
          id="console-input"
          className="min-w-0 flex-1 rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:bg-black/40 dark:focus:border-white/50"
          placeholder={t("inputPlaceholder", locale)}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          disabled={props.disabled}
          autoComplete="off"
        />
        <button
          type="submit"
          aria-label={t("send", locale)}
          disabled={props.disabled || props.value.trim().length === 0}
          className="rounded-xl border border-black/15 p-2 disabled:opacity-40 dark:border-white/20"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4 rtl:rotate-180" aria-hidden fill="currentColor">
            <path d="M2 10 18 3l-5 7 5 7z" />
          </svg>
        </button>
        {props.voiceActive ? (
          <>
            <button
              type="button"
              onClick={props.onToggleMute}
              aria-pressed={props.muted}
              className="rounded-xl border border-black/15 px-2.5 py-2 text-xs dark:border-white/20"
            >
              {props.muted ? t("unmute", locale) : t("mute", locale)}
            </button>
            <button
              type="button"
              onClick={props.onEnd}
              className="rounded-xl border border-red-500/40 px-2.5 py-2 text-xs text-red-600 dark:text-red-400"
            >
              {t("endCall", locale)}
            </button>
          </>
        ) : null}
      </form>

      <div className="mt-2 flex items-center gap-1 pb-2" role="group" aria-label={t("languageLabel", locale)}>
        {PILLS.map(({ pref, key }) => (
          <button
            key={pref}
            type="button"
            onClick={() => props.onLangPref(pref)}
            aria-pressed={props.langPref === pref}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
              props.langPref === pref
                ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                : "border-black/15 opacity-70 dark:border-white/20"
            }`}
          >
            {t(key, locale)}
          </button>
        ))}
      </div>
    </div>
  );
}
