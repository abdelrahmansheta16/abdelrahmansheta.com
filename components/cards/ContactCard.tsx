"use client";
/** Contact card: work e-mail, LinkedIn, and the two in-console actions. Fixed recipients only. */
import type { Locale } from "@/lib/tools/schema";
import type { ConsoleCorpus } from "@/components/console/types";
import CardShell, { CardButton } from "@/components/cards/CardShell";
import { t } from "@/components/console/strings";

export default function ContactCard({
  corpus,
  locale,
  onLeaveMessage,
  onBookCall,
}: {
  corpus: ConsoleCorpus;
  locale: Locale;
  onLeaveMessage?: () => void;
  onBookCall?: () => void;
}) {
  const { links } = corpus;
  return (
    <CardShell
      title={t("cardContact", locale)}
      footer={
        <>
          {onLeaveMessage ? <CardButton onClick={onLeaveMessage}>{t("leaveMessage", locale)}</CardButton> : null}
          {onBookCall ? <CardButton onClick={onBookCall}>{t("bookCall", locale)}</CardButton> : null}
        </>
      }
    >
      <p>
        <a className="underline" href={`mailto:${links.contact_email}`}>
          {links.contact_email}
        </a>
      </p>
      <p>
        <a className="underline" href={links.linkedin} rel="noopener noreferrer" target="_blank">
          LinkedIn
        </a>
        {" · "}
        <a className="underline" href={links.github} rel="noopener noreferrer" target="_blank">
          GitHub
        </a>
      </p>
    </CardShell>
  );
}
