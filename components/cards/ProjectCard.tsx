"use client";
/** Inline project card rendered when the model calls show_project. Only `public` metrics are shown. */
import type { Locale } from "@/lib/tools/schema";
import type { ConsoleProject } from "@/components/console/types";
import CardShell from "@/components/cards/CardShell";
import { t } from "@/components/console/strings";

export default function ProjectCard({
  slug,
  projects,
  locale,
}: {
  slug: string;
  projects: ConsoleProject[];
  locale: Locale;
}) {
  const project = projects.find((p) => p.slug === slug);
  if (!project) {
    return (
      <CardShell title={t("cardProject", locale)}>
        <p className="opacity-70">{slug}</p>
      </CardShell>
    );
  }
  const metrics = project.metrics.filter((m) => m.public);
  return (
    <CardShell title={t("cardProject", locale)}>
      <p className="font-semibold">{project.name}</p>
      <p className="opacity-70">
        {project.employer} · {project.period}
      </p>
      {metrics.length > 0 ? (
        <ul className="list-disc space-y-1 ps-5">
          {metrics.map((m) => (
            <li key={m.text}>{m.text}</li>
          ))}
        </ul>
      ) : null}
    </CardShell>
  );
}
