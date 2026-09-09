"use client";
/**
 * Renders one tool part of an assistant message. Every state is handled — a half-streamed call, a call
 * whose output never arrived and an errored call all render something calm rather than crashing.
 */
import type { Locale } from "@/lib/tools/schema";
import type { ConsoleCorpus } from "@/components/console/types";
import { cardFor, type ConsoleCard } from "@/components/console/effects";
import { t } from "@/components/console/strings";
import ProjectCard from "@/components/cards/ProjectCard";
import AvailabilityCard from "@/components/cards/AvailabilityCard";
import BookCallCard from "@/components/cards/BookCallCard";
import CVCard from "@/components/cards/CVCard";
import ContactCard from "@/components/cards/ContactCard";
import MessageForm from "@/components/cards/MessageForm";
import SummaryConsentCard from "@/components/cards/SummaryConsentCard";
import LeadCard from "@/components/cards/LeadCard";

export type ToolPartState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error"
  | "approval-requested"
  | "approval-responded"
  | "output-denied";

export function Card({
  card,
  corpus,
  locale,
}: {
  card: ConsoleCard;
  corpus: ConsoleCorpus;
  locale: Locale;
}) {
  switch (card.kind) {
    case "project":
      return <ProjectCard slug={card.slug} projects={corpus.projects} locale={locale} />;
    case "availability":
      return <AvailabilityCard corpus={corpus} locale={locale} />;
    case "book_call":
      return <BookCallCard locale={locale} calLink={corpus.links.cal_link} />;
    case "cv":
      return <CVCard locale={locale} href={corpus.links.cv_public_path} />;
    case "message":
      return <MessageForm locale={locale} />;
    case "summary":
      return <SummaryConsentCard locale={locale} />;
    case "lead":
      return <LeadCard locale={locale} reason={card.reason} />;
    case "contact":
      return <ContactCard corpus={corpus} locale={locale} />;
  }
}

export default function ToolPart({
  name,
  state,
  input,
  errorText,
  corpus,
  locale,
}: {
  name: string;
  state: string;
  input: unknown;
  errorText?: string;
  corpus: ConsoleCorpus;
  locale: Locale;
}) {
  if (state === "input-streaming" || state === "input-available") {
    return (
      <p className="my-1 text-xs opacity-50" aria-hidden>
        {t("thinking", locale)}…
      </p>
    );
  }
  if (state === "output-error" || state === "output-denied") {
    return (
      <p className="my-1 text-xs opacity-60">
        {errorText ?? (locale === "ar" ? "الكارت دا مارضاش يفتح." : "That card would not open.")}
      </p>
    );
  }
  if (state !== "output-available") return null;
  const card = cardFor(name, input);
  if (!card) return null;
  return <Card card={card} corpus={corpus} locale={locale} />;
}
