"use client";
/**
 * Cal.com booking card. The embed is ~90 kB, so it is loaded with next/dynamic only when the model
 * actually calls open_book_call. NEXT_PUBLIC_CAL_URL holds the cal link ("handle/event-type").
 */
import dynamic from "next/dynamic";
import type { Locale } from "@/lib/tools/schema";
import CardShell, { CardButton } from "@/components/cards/CardShell";
import { t } from "@/components/console/strings";

const Cal = dynamic(() => import("@calcom/embed-react").then((m) => m.default), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-lg bg-black/5 dark:bg-white/10" />,
});

export default function BookCallCard({ locale, calLink }: { locale: Locale; calLink?: string }) {
  const link = calLink ?? process.env.NEXT_PUBLIC_CAL_URL;
  if (!link) {
    return (
      <CardShell title={t("bookCall", locale)}>
        <p className="opacity-70">{t("bookCallUnavailable", locale)}</p>
      </CardShell>
    );
  }
  const external = link.startsWith("http") ? link : `https://cal.com/${link}`;
  const embedLink = link.replace(/^https?:\/\/(?:app\.)?cal\.com\//, "");
  return (
    <CardShell
      title={t("bookCall", locale)}
      footer={
        <CardButton href={external}>
          {locale === "ar" ? "افتحها في تاب جديد" : "Open in a new tab"}
        </CardButton>
      }
    >
      <div className="h-[28rem] overflow-hidden rounded-lg">
        <Cal calLink={embedLink} style={{ width: "100%", height: "100%", overflow: "scroll" }} />
      </div>
    </CardShell>
  );
}
