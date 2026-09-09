/**
 * Renders public/cv.pdf from the compiled corpus. English only for now, A4, at most two pages.
 *
 * Invariant 1 by construction: this file reads `profile`, `proofPoints`, `logistics` and `links`
 * and never touches a phone number or a personal address — CompiledCorpus has no phone field, and
 * the only address rendered is `links.contact_email`. There is no code path that could emit one.
 * Output is gitignored; CI builds it against knowledge.example.
 *
 *   pnpm build:cv            write public/cv.pdf
 *   pnpm build:cv --out x    write somewhere else
 */
import { createElement as h } from "react";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { DocumentProps } from "@react-pdf/renderer";
import { Document, Page, StyleSheet, Text, View, renderToFile } from "@react-pdf/renderer";
// Named import, not default: the ESM/CJS interop for a default export differs between
// `tsx script.mts` and `tsx --eval`, and CORPUS is stable in both.
import { CORPUS } from "@/lib/corpus/corpus.generated";
import type { CompiledCorpus } from "@/lib/corpus/schema";

// Helvetica is built into every PDF reader. Embedding IBM Plex would need font files in the repo
// for a document nobody reads in Arabic yet; revisit when the Arabic CV lands.
const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 36, paddingHorizontal: 44, fontFamily: "Helvetica" },
  name: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  headline: { fontSize: 10.5, color: "#333333", marginBottom: 2 },
  meta: { fontSize: 8.5, color: "#555555", marginBottom: 12 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.1,
    color: "#111111",
    marginTop: 12,
    marginBottom: 5,
    borderBottomWidth: 0.6,
    borderBottomColor: "#cccccc",
    paddingBottom: 2,
  },
  body: { fontSize: 9, lineHeight: 1.45, color: "#222222" },
  roleHeader: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  roleTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold" },
  roleDates: { fontSize: 8.5, color: "#666666" },
  roleSub: { fontSize: 8.5, color: "#555555", marginBottom: 2 },
  bullet: { fontSize: 9, lineHeight: 1.4, color: "#222222", marginBottom: 1.5 },
  chipRow: { fontSize: 8.5, color: "#333333", marginBottom: 2 },
});

function period(start: string, end: string | null): string {
  return `${start} — ${end ?? "present"}`;
}

function section(title: string, children: React.ReactNode): React.ReactElement {
  return h(View, { key: title, wrap: false }, [
    h(Text, { key: "t", style: styles.sectionTitle }, title.toUpperCase()),
    h(View, { key: "c" }, children),
  ]);
}

export function buildCvDocument(data: CompiledCorpus): React.ReactElement<DocumentProps> {
  const { profile, proofPoints, logistics, links } = data;

  const header = [
    h(Text, { key: "n", style: styles.name }, profile.name),
    h(Text, { key: "h", style: styles.headline }, profile.headline),
    h(
      Text,
      { key: "m", style: styles.meta },
      [profile.location, links.contact_email, links.linkedin, links.github].join("  ·  "),
    ),
  ];

  const summary = section("Summary", h(Text, { style: styles.body }, profile.summary));

  const highlights = section(
    "Selected results",
    proofPoints
      .slice(0, 6)
      .map((p) => h(Text, { key: p.id, style: styles.bullet }, `• ${p.claim} (${p.metric})`)),
  );

  const experience = section(
    "Experience",
    profile.roles.map((role, i) =>
      h(View, { key: `${role.company}-${i}`, wrap: false }, [
        h(View, { key: "hd", style: styles.roleHeader }, [
          h(Text, { key: "t", style: styles.roleTitle }, `${role.title} — ${role.company}`),
          h(Text, { key: "d", style: styles.roleDates }, period(role.start, role.end)),
        ]),
        h(
          Text,
          { key: "sub", style: styles.roleSub },
          [role.location, role.stack.slice(0, 8).join(", ")].filter(Boolean).join("  ·  "),
        ),
        ...role.achievements
          .slice(0, 4)
          .map((a, j) => h(Text, { key: `a${j}`, style: styles.bullet }, `• ${a}`)),
      ]),
    ),
  );

  const skills = section(
    "Skills",
    Object.entries(profile.skills).map(([group, items]) =>
      h(Text, { key: group, style: styles.chipRow }, `${group}: ${items.join(", ")}`),
    ),
  );

  const education = section(
    "Education",
    profile.education.map((e, i) =>
      h(
        Text,
        { key: `e${i}`, style: styles.bullet },
        `• ${e.degree}, ${e.institution} (${e.start}–${e.end})`,
      ),
    ),
  );

  const availability = section(
    "Availability",
    h(
      Text,
      { style: styles.body },
      [
        logistics.status_phrase_en,
        `Based in ${logistics.based_in} (${logistics.timezone}).`,
        logistics.engagement.employment && logistics.engagement.contract
          ? "Open to employment or contract."
          : logistics.engagement.employment
            ? "Open to employment."
            : "Open to contract work.",
        `Notice period: ${logistics.notice_period}.`,
      ].join(" "),
    ),
  );

  const body = [...header, summary, highlights, experience, skills, education, availability];

  return h<DocumentProps>(
    Document,
    { title: `${profile.name} — CV`, author: profile.name, creator: "build-cv.ts" },
    h(Page, { size: "A4", style: styles.page }, body),
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const outIndex = argv.indexOf("--out");
  const out =
    outIndex >= 0 && argv[outIndex + 1]
      ? path.resolve(argv[outIndex + 1])
      : path.resolve(process.cwd(), "public", "cv.pdf");

  await mkdir(path.dirname(out), { recursive: true });
  await renderToFile(buildCvDocument(CORPUS), out);
  process.stdout.write(`wrote ${out} (corpus ${CORPUS.version})\n`);
}

const invokedDirectly = typeof process.argv[1] === "string" && process.argv[1].includes("build-cv");

if (invokedDirectly) {
  main().catch((err: unknown) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  });
}
