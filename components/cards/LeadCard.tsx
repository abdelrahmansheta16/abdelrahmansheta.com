"use client";
/**
 * Lead capture, offered at most once per session and only after hiring intent. "No thanks" is a first
 * class button: the card must never feel like a wall.
 */
import { useState } from "react";
import type { Locale } from "@/lib/tools/schema";
import CardShell, { CardButton, CardField, inputClass } from "@/components/cards/CardShell";
import { postLead } from "@/lib/client/api";
import { reasonCopy, t } from "@/components/console/strings";

export default function LeadCard({ locale, reason }: { locale: Locale; reason?: string }) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "declined">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "sent") {
    return (
      <CardShell title={t("leadIntro", locale)}>
        <p>{t("sent", locale)}</p>
      </CardShell>
    );
  }
  if (state === "declined") return null;

  return (
    <CardShell title={t("leadIntro", locale)}>
      {reason ? <p className="opacity-70">{reason}</p> : null}
      <form
        className="space-y-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (honeypot.length > 0) return;
          setState("sending");
          setError(null);
          const result = await postLead({
            name: name.trim(),
            company: company.trim() || undefined,
            email: email.trim(),
          });
          if (result.ok) setState("sent");
          else {
            setState("idle");
            setError(reasonCopy(result.reason, locale));
          }
        }}
      >
        <CardField label={t("yourName", locale)}>
          <input className={inputClass} required value={name} onChange={(e) => setName(e.target.value)} />
        </CardField>
        <CardField label={`${t("yourCompany", locale)} (${t("optional", locale)})`}>
          <input className={inputClass} value={company} onChange={(e) => setCompany(e.target.value)} />
        </CardField>
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
        <div className="flex gap-2">
          <CardButton type="submit" disabled={state === "sending"}>
            {t("submit", locale)}
          </CardButton>
          <CardButton onClick={() => setState("declined")}>{t("noThanks", locale)}</CardButton>
        </div>
      </form>
    </CardShell>
  );
}
