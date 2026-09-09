/** The proof grid. Each card carries data-proof-id so highlight_proof_point can find it. */
import corpus from "@/lib/corpus/corpus.generated";
import { getTranslations } from "next-intl/server";

export default async function ProofGrid({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "proof" });
  const isArabic = locale === "ar";

  return (
    <section id="proof" className="mx-auto max-w-5xl px-5 py-16">
      <h2 className="text-2xl font-semibold tracking-tight">{t("title")}</h2>
      <p className="mt-2 max-w-[var(--measure)] text-muted">{t("lede")}</p>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {corpus.proofPoints.map((pp) => (
          <li key={pp.id}>
            <article
              data-proof-id={pp.id}
              className="h-full rounded-xl border border-border bg-bg-raised p-4 transition-colors target:border-accent"
            >
              <p className="num text-lg font-semibold text-accent">{pp.metric}</p>
              <p className="mt-2 text-sm text-fg">
                {isArabic ? <bdi dir="ltr">{pp.claim}</bdi> : pp.claim}
              </p>
              <p className="mt-3 text-xs text-muted">
                <bdi dir="ltr">{pp.evidence_role}</bdi>
              </p>
              {pp.verified ? (
                <p className="mt-2 text-[11px] uppercase tracking-wide text-muted">{t("verified")}</p>
              ) : null}
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
