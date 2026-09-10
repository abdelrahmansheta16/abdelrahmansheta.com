/** Experience timeline, straight from corpus.profile.roles. */
import corpus from "@/lib/corpus/corpus.generated";
import { getTranslations } from "next-intl/server";
import { formatRange } from "./format";
import Reveal from "@/components/motion/Reveal";
import SectionHeading from "@/components/spine/SectionHeading";

export default async function Timeline({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "experience" });

  return (
    <section id="experience" className="mx-auto max-w-5xl px-5 py-20">
      <SectionHeading title={t("title")} lede={t("lede")} />

      {/*
        The rail is a gradient rather than a flat hairline, and it fades out at the bottom so the
        list ends rather than being cut off. Drawn on the <ol> as a background so it needs no extra
        element, and `border-s` is replaced because a border cannot hold a gradient.
      */}
      <ol
        className="relative mt-10 ps-px"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, var(--grad-a), var(--grad-c) 55%, transparent 100%)",
          backgroundSize: "1px 100%",
          backgroundRepeat: "no-repeat",
        }}
      >
        {corpus.profile.roles.map((role, i) => (
          <Reveal
            as="li"
            key={`${role.company}-${role.start}`}
            delay={Math.min(i, 5) * 80}
            className="relative ps-6 pb-12 last:pb-0"
          >
            <span
              aria-hidden="true"
              className="absolute start-0 top-2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-accent ring-4 ring-bg rtl:translate-x-1/2"
              style={{ boxShadow: "0 0 12px 2px color-mix(in oklab, var(--grad-b) 70%, transparent)" }}
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
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
