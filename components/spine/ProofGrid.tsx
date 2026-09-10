/** The proof grid. Each card carries data-proof-id so highlight_proof_point can find it. */
import corpus from "@/lib/corpus/corpus.generated";
import { getTranslations } from "next-intl/server";
import Reveal from "@/components/motion/Reveal";
import SectionHeading from "@/components/spine/SectionHeading";

export default async function ProofGrid({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "proof" });
  const isArabic = locale === "ar";

  return (
    <section id="proof" className="mx-auto max-w-5xl px-5 py-20">
      <SectionHeading title={t("title")} lede={t("lede")} />

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {corpus.proofPoints.map((pp, i) => (
          // Stagger caps at six so the last card in a long list is not left waiting most of a
          // second after the first.
          <Reveal as="li" key={pp.id} delay={Math.min(i, 5) * 70}>
            <article
              data-proof-id={pp.id}
              className="grad-border glow-hover h-full p-5 target:ring-1 target:ring-accent"
            >
              <p className="num text-2xl font-semibold text-accent">{pp.metric}</p>
              <p className="mt-2 text-sm text-fg">
                {isArabic ? <bdi dir="ltr">{pp.claim}</bdi> : pp.claim}
              </p>
              <p className="mt-3 text-xs text-muted">
                <bdi dir="ltr">{pp.evidence_role}</bdi>
              </p>
              {pp.verified ? (
                <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] uppercase tracking-wide text-accent">
                  <span aria-hidden="true" className="h-1 w-1 rounded-full bg-accent" />
                  {t("verified")}
                </p>
              ) : null}
            </article>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
