/** Hero: name, headline, the cloned-voice line, the orb mount, the console triggers and 4 prompt chips. */
import corpus from "@/lib/corpus/corpus.generated";
import { getTranslations } from "next-intl/server";
import ConsoleTrigger from "./ConsoleTrigger";

const CHIP_KEYS = ["cravit", "cost", "markets", "cv"] as const;

export default async function Hero({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "hero" });
  const { profile } = corpus;

  return (
    <section id="hero" className="mx-auto max-w-5xl px-5 pt-14 pb-20 sm:pt-20">
      <p className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-raised px-3 py-1 text-xs text-muted">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-accent" />
        {t("badge")}
      </p>

      <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">{profile.name}</h1>
      <p className="mt-3 max-w-[var(--measure)] text-lg text-fg sm:text-xl">{profile.headline}</p>
      {profile.subheadline ? (
        <p className="mt-2 max-w-[var(--measure)] text-muted">{profile.subheadline}</p>
      ) : null}

      {/* The one living element: the audio-reactive orb mounts here (owned by the console area). */}
      <div id="agent-orb" className="mt-10 h-32 w-32 sm:h-40 sm:w-40" aria-hidden="true" />

      <p className="mt-6 max-w-[var(--measure)] text-sm text-muted">{t("voiceNote")}</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <ConsoleTrigger
          mode="voice"
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-[#0b0b0c] transition-opacity hover:opacity-90"
        >
          {t("talk")}
        </ConsoleTrigger>
        <ConsoleTrigger
          mode="text"
          className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-fg transition-colors hover:border-accent"
        >
          {t("type")}
        </ConsoleTrigger>
      </div>

      <ul aria-label={t("chipsLabel")} className="mt-6 flex flex-wrap gap-2">
        {CHIP_KEYS.map((key) => (
          <li key={key}>
            <ConsoleTrigger
              mode="text"
              prompt={t(`chips.${key}.prompt`)}
              className="rounded-full border border-border bg-bg-raised px-3.5 py-1.5 text-start text-sm text-muted transition-colors hover:border-accent hover:text-fg"
            >
              {t(`chips.${key}.label`)}
            </ConsoleTrigger>
          </li>
        ))}
      </ul>

      {/* CONSOLE_MOUNT */}
    </section>
  );
}
