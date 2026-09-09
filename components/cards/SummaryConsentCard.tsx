"use client";
/** "E-mail me a summary": address plus an explicit, unticked consent box. Once per session, server enforced. */
import { useState } from "react";
import type { Locale } from "@/lib/tools/schema";
import CardShell, { CardButton, CardField, inputClass } from "@/components/cards/CardShell";
import { postSummary } from "@/lib/client/api";
import { reasonCopy, t } from "@/components/console/strings";

export default function SummaryConsentCard({ locale }: { locale: Locale }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "sent") {
    return (
      <CardShell title={t("emailSummary", locale)}>
        <p>{t("sent", locale)}</p>
      </CardShell>
    );
  }

  return (
    <CardShell title={t("emailSummary", locale)}>
      <form
        className="space-y-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (honeypot.length > 0) return;
          if (!consent) {
            setError(t("consentRequired", locale));
            return;
          }
          setState("sending");
          setError(null);
          const result = await postSummary(email.trim());
          if (result.ok) setState("sent");
          else {
            setState("idle");
            setError(reasonCopy(result.reason, locale));
          }
        }}
      >
        <CardField label={t("yourEmail", locale)}>
          <input
            className={inputClass}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </CardField>
        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
          <span>{t("summaryConsent", locale)}</span>
        </label>
        <input
          className="absolute -left-[9999px] h-0 w-0"
          tabIndex={-1}
          aria-hidden
          autoComplete="off"
          name="website"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
        {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
        <CardButton type="submit" disabled={state === "sending"}>
          {t("submit", locale)}
        </CardButton>
      </form>
    </CardShell>
  );
}
