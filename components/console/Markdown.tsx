"use client";
/** Renders the parsed markdown subset as React elements. Arabic runs get <bdi> around their Latin spans. */
import { Fragment } from "react";
import type { Locale } from "@/lib/tools/schema";
import { parseMarkdown, type Inline } from "@/components/console/markdown-parser";
import { splitBidiRuns } from "@/lib/client/lang";

function Text({ value, locale }: { value: string; locale: Locale }) {
  if (locale !== "ar") return <>{value}</>;
  return (
    <>
      {splitBidiRuns(value).map((run, i) =>
        run.latin ? <bdi key={i}>{run.text}</bdi> : <Fragment key={i}>{run.text}</Fragment>,
      )}
    </>
  );
}

function Inlines({ nodes, locale }: { nodes: Inline[]; locale: Locale }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case "bold":
            return (
              <strong key={i}>
                <Text value={node.value} locale={locale} />
              </strong>
            );
          case "code":
            return (
              <code key={i} className="rounded bg-black/5 px-1 py-0.5 text-[0.9em] dark:bg-white/10">
                <bdi>{node.value}</bdi>
              </code>
            );
          case "link":
            return (
              <a key={i} className="underline" href={node.href} rel="noopener noreferrer" target="_blank">
                <Text value={node.value} locale={locale} />
              </a>
            );
          default:
            return <Text key={i} value={node.value} locale={locale} />;
        }
      })}
    </>
  );
}

export default function Markdown({ source, locale }: { source: string; locale: Locale }) {
  const blocks = parseMarkdown(source);
  return (
    <>
      {blocks.map((block, i) =>
        block.type === "paragraph" ? (
          <p key={i} className="whitespace-pre-wrap">
            <Inlines nodes={block.inlines} locale={locale} />
          </p>
        ) : block.ordered ? (
          <ol key={i} className="list-decimal space-y-1 ps-5">
            {block.items.map((item, j) => (
              <li key={j}>
                <Inlines nodes={item} locale={locale} />
              </li>
            ))}
          </ol>
        ) : (
          <ul key={i} className="list-disc space-y-1 ps-5">
            {block.items.map((item, j) => (
              <li key={j}>
                <Inlines nodes={item} locale={locale} />
              </li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}
