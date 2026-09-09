/** Project cards. Each card id is `project-<slug>` so show_project can expand the right one. */
import corpus from "@/lib/corpus/corpus.generated";
import { getTranslations } from "next-intl/server";
import ConsoleTrigger from "./ConsoleTrigger";

export default async function Projects({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "projects" });

  return (
    <section id="projects" className="mx-auto max-w-5xl px-5 py-16">
      <h2 className="text-2xl font-semibold tracking-tight">{t("title")}</h2>
      <p className="mt-2 max-w-[var(--measure)] text-muted">{t("lede")}</p>

      <ul className="mt-8 grid gap-4 md:grid-cols-2">
        {corpus.projects.map((project) => (
          <li key={project.slug}>
            <article
              id={`project-${project.slug}`}
              className="flex h-full flex-col rounded-xl border border-border bg-bg-raised p-5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-lg font-medium">
                  <bdi dir="ltr">{project.name}</bdi>
                </h3>
                {project.public_level === "summary_only" ? (
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                    {t("summaryOnly")}
                  </span>
                ) : null}
              </div>
              <p className="num mt-1 text-xs text-muted">
                <bdi dir="ltr">
                  {project.employer} · {project.period}
                </bdi>
              </p>
              <p className="mt-3 text-sm text-fg">
                <bdi dir="ltr">{project.body}</bdi>
              </p>

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
          </li>
        ))}
      </ul>
    </section>
  );
}
