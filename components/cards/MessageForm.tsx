"use client";
/**
 * Leave-a-message form. The visitor types and submits it themselves — the agent never sends anything.
 * `website` is the honeypot the API requires to be empty; it is off-screen, never auto-filled.
 */
import { useState } from "react";
import type { Locale } from "@/lib/tools/schema";
import CardShell, { CardButton, CardField, inputClass } from "@/components/cards/CardShell";
import { postMessage } from "@/lib/client/api";
import { reasonCopy, t } from "@/components/console/strings";

export default function MessageForm({ locale }: { locale: Locale }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "sent") {
    return (
      <CardShell title={t("leaveMessage", locale)}>
        <p>{t("sent", locale)}</p>
      </CardShell>
    );
  }

  return (
    <CardShell title={t("leaveMessage", locale)}>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (honeypot.length > 0 || body.trim().length === 0) return;
          setState("sending");
          setError(null);
          const result = await postMessage({
            name: name.trim() || undefined,
            email: email.trim() || undefined,
            body: body.trim(),
          });
          if (result.ok) setState("sent");
          else {
            setState("idle");
            setError(reasonCopy(result.reason, locale));
          }
        }}
        className="space-y-2"
      >
        <CardField label={`${t("yourName", locale)} (${t("optional", locale)})`}>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </CardField>
        <CardField label={`${t("yourEmail", locale)} (${t("optional", locale)})`}>
          <input
            className={inputClass}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </CardField>
        <CardField label={t("yourMessage", locale)}>
          <textarea
            className={inputClass}
            rows={3}
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
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
        <CardButton type="submit" disabled={state === "sending"}>
          {t("submit", locale)}
        </CardButton>
      </form>
    </CardShell>
  );
}
