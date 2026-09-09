"use client";
/** Logistics card: where he can work, timezone overlap, employment vs contract. No salary, by construction. */
import type { Locale } from "@/lib/tools/schema";
import type { ConsoleCorpus } from "@/components/console/types";
import CardShell from "@/components/cards/CardShell";
import { t } from "@/components/console/strings";

export default function AvailabilityCard({ corpus, locale }: { corpus: ConsoleCorpus; locale: Locale }) {
  const { logistics } = corpus;
  const markets = Object.entries(logistics.markets);
  const overlap = Object.entries(logistics.overlap);
  return (
    <CardShell title={t("cardAvailability", locale)}>
      <p className="font-medium">{locale === "ar" ? logistics.status_phrase_ar : logistics.status_phrase_en}</p>
      <p className="opacity-70">
        {logistics.based_in} · {logistics.timezone}
      </p>
      {markets.length > 0 ? (
        <ul className="space-y-1">
          {markets.map(([key, value]) => (
            <li key={key}>
              <span className="font-medium uppercase">{key}</span>: {value.answer} —{" "}
              {locale === "ar" ? value.note_ar : value.note_en}
            </li>
          ))}
        </ul>
      ) : null}
      {overlap.length > 0 ? (
        <p className="opacity-70">{overlap.map(([city, hours]) => `${city}: ${hours}`).join(" · ")}</p>
      ) : null}
      <p className="opacity-70">
        {logistics.engagement.employment ? (locale === "ar" ? "توظيف" : "Employment") : null}
        {logistics.engagement.employment && logistics.engagement.contract ? " · " : null}
        {logistics.engagement.contract ? (locale === "ar" ? "عقود فريلانس" : "Contract") : null}
      </p>
    </CardShell>
  );
}
