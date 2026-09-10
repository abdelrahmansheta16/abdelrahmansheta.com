/** Hero: the orb, name, headline, the cloned-voice line, the console triggers and 4 prompt chips. */
import corpus from "@/lib/corpus/corpus.generated";
import { getTranslations } from "next-intl/server";
import ConsoleTrigger from "./ConsoleTrigger";
import Reveal from "@/components/motion/Reveal";
import MeshBackdrop from "@/components/motion/MeshBackdrop";
import HeroOrb from "@/components/spine/HeroOrb";

const CHIP_KEYS = ["cravit", "cost", "markets", "cv"] as const;

export default async function Hero({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "hero" });
  const { profile } = corpus;

  return (
    // `isolate` gives the mesh its own stacking context, so its negative z-index cannot slide
    // behind the page background and disappear.
    <section id="hero" className="relative isolate overflow-hidden px-5 pt-14 pb-24 sm:pt-20">
      <MeshBackdrop />

      <div className="mx-auto max-w-5xl">
        <Reveal>
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-bg-raised/70 px-3 py-1 text-xs text-muted backdrop-blur">
            <span aria-hidden="true" className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
            {t("badge")}
          </p>
        </Reveal>

        {/*
          The orb, finally mounted. It was designed as the hero's one living element and had a
          placeholder div reserving 128px for it that nothing ever filled — the component only
          appeared inside the console header, which a visitor sees after they have already decided
          to engage. It belongs above the fold, where it does the persuading.
        */}
        <Reveal delay={60} className="mt-10">
          <HeroOrb label={t("orbLabel")} />
        </Reveal>

        <Reveal delay={120}>
          <h1 className="mt-8 text-4xl font-semibold tracking-tight sm:text-6xl">
            <span className="grad-text">{profile.name}</span>
          </h1>
        </Reveal>

        <Reveal delay={180}>
          <p className="mt-4 max-w-[var(--measure)] text-lg text-fg sm:text-2xl">{profile.headline}</p>
        </Reveal>

        {profile.subheadline ? (
          <Reveal delay={240}>
            <p className="mt-3 max-w-[var(--measure)] text-muted">{profile.subheadline}</p>
          </Reveal>
        ) : null}

        <Reveal delay={300}>
          <p className="mt-8 max-w-[var(--measure)] text-sm text-muted">{t("voiceNote")}</p>
        </Reveal>

        <Reveal delay={360}>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ConsoleTrigger
              mode="voice"
              className="glow-hover rounded-full btn-gradient px-5 py-2.5 text-sm font-semibold"
            >
              {t("talk")}
            </ConsoleTrigger>
            <ConsoleTrigger
              mode="text"
              className="rounded-full border border-border px-5 py-2.5 text-sm font-medium text-fg transition-colors hover:border-accent hover:text-accent"
            >
              {t("type")}
            </ConsoleTrigger>
          </div>
        </Reveal>

        <Reveal delay={420}>
          <ul aria-label={t("chipsLabel")} className="mt-6 flex flex-wrap gap-2">
            {CHIP_KEYS.map((key) => (
              <li key={key}>
                <ConsoleTrigger
                  mode="text"
                  prompt={t(`chips.${key}.prompt`)}
                  className="rounded-full border border-border bg-bg-raised/60 px-3.5 py-1.5 text-start text-sm text-muted backdrop-blur transition-colors hover:border-accent-dim hover:text-fg"
                >
                  {t(`chips.${key}.label`)}
                </ConsoleTrigger>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
