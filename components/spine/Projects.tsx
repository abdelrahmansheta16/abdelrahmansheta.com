/** Project cards. Each card id is `project-<slug>` so show_project can expand the right one. */
import corpus from "@/lib/corpus/corpus.generated";
import { getTranslations } from "next-intl/server";
import ConsoleTrigger from "./ConsoleTrigger";
import Reveal from "@/components/motion/Reveal";
import SectionHeading from "@/components/spine/SectionHeading";

export default async function Projects({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "projects" });

  return (
    <section id="projects" className="mx-auto max-w-5xl px-5 py-20">
      <SectionHeading title={t("title")} lede={t("lede")} />

      <ul className="mt-10 grid gap-4 md:grid-cols-2">
        {corpus.projects.map((project, i) => (
          <Reveal as="li" key={project.slug} delay={Math.min(i, 5) * 70}>
            <article
              id={`project-${project.slug}`}
              className="grad-border glow-hover flex h-full flex-col p-5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-lg font-medium">
                  <bdi dir="ltr">{project.name}</bdi>
                </h3>
                {project.public_level === "summary_only" ? (
                  <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">
                    {t("summaryOnly")}
                  </span>
                ) : null}
              </div>
              <p className="num mt-1 text-xs text-muted">
                <bdi dir="ltr">
                  {project.employer} · {project.period}
                </bdi>
              </p>
              {/*
                A card is a summary; the agent holds the depth.

                This used to render `project.body` — the entire deep-dive, up to 8,000 characters,
                in one <p>, with the `##` markdown showing as literal text. Eight of those made the
                section about 34,000 characters of unbroken prose that nobody was going to read.

                `summary` is derived at compile time from the same body: the author's own opening
                paragraph, then one bullet per section he wrote, labelled with his own heading. A
                summary_only project has an empty body, so it summarises to nothing and falls back
                to the spoken talking point, which the agent says aloud to strangers anyway.
              */}
              {project.summary.lead ? (
                <p className="mt-3 text-sm text-fg">
                  <bdi dir="ltr">{project.summary.lead}</bdi>
                </p>
              ) : null}

              {project.summary.highlights.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {project.summary.highlights.map((h) => (
                    <li key={h.label} className="flex gap-2.5 text-sm">
                      <span
                        aria-hidden="true"
                        className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent-dim"
                      />
                      <span>
                        <strong className="font-medium text-fg">
                          <bdi dir="ltr">{h.label}</bdi>
                        </strong>{" "}
                        <span className="text-muted">
                          <bdi dir="ltr">{h.text}</bdi>
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-fg">
                  <bdi dir="ltr">
                    {(locale === "ar" ? project.spoken_ar : project.spoken_en) ?? ""}
                  </bdi>
                </p>
              )}

              {project.metrics.filter((m) => m.public).length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {project.metrics
                    .filter((m) => m.public)
                    .map((m) => (
                      <li
                        key={m.text}
                        className="num rounded-md bg-accent-soft px-2 py-1 text-xs text-accent"
                      >
                        <bdi dir="ltr">{m.text}</bdi>
                      </li>
                    ))}
                </ul>
              ) : null}

              {project.stack.length > 0 ? (
                <p className="mt-3 text-xs text-muted">
                  <span className="me-2">{t("stack")}:</span>
                  <bdi dir="ltr" className="latin">
                    {project.stack.join(" · ")}
                  </bdi>
                </p>
              ) : null}

              <div className="mt-auto pt-4">
                <ConsoleTrigger
                  mode="text"
                  prompt={t("askPrompt", { name: project.name })}
                  className="text-sm text-accent hover:underline"
                >
                  {t("ask")}
                </ConsoleTrigger>
              </div>
            </article>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
