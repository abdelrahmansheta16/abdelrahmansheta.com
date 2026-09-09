/** Experience timeline, straight from corpus.profile.roles. */
import corpus from "@/lib/corpus/corpus.generated";
import { getTranslations } from "next-intl/server";
import { formatRange } from "./format";

export default async function Timeline({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "experience" });

  return (
    <section id="experience" className="mx-auto max-w-5xl px-5 py-16">
      <h2 className="text-2xl font-semibold tracking-tight">{t("title")}</h2>
      <p className="mt-2 max-w-[var(--measure)] text-muted">{t("lede")}</p>

      <ol className="mt-8 border-s border-border">
        {corpus.profile.roles.map((role) => (
          <li key={`${role.company}-${role.start}`} className="relative ps-6 pb-10 last:pb-0">
            <span
              aria-hidden="true"
              className="absolute start-0 top-2 h-2 w-2 -translate-x-1/2 rounded-full bg-accent rtl:translate-x-1/2"
            />
            <p className="num text-xs text-muted">
              {formatRange(role.start, role.end, locale, t("present"))}
            </p>
            <h3 className="mt-1 text-lg font-medium">
              <bdi dir="ltr">{role.title}</bdi>
              {" · "}
              {role.company_url ? (
                <a className="hover:text-accent" href={role.company_url} rel="noopener">
                  <bdi dir="ltr">{role.company}</bdi>
                </a>
              ) : (
                <bdi dir="ltr">{role.company}</bdi>
              )}
            </h3>
            {role.location ? <p className="text-sm text-muted">{role.location}</p> : null}
            <ul className="mt-3 space-y-1.5 text-sm text-fg">
              {role.achievements.map((a) => (
                <li key={a} className="flex gap-2">
                  <span aria-hidden="true" className="text-accent">
                    ·
                  </span>
                  <span>
                    <bdi dir="ltr">{a}</bdi>
                  </span>
                </li>
              ))}
            </ul>
            {role.stack.length > 0 ? (
              <p className="mt-3 text-xs text-muted">
                <span className="me-2">{t("stack")}:</span>
                <bdi dir="ltr" className="latin">
                  {role.stack.join(" · ")}
                </bdi>
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
