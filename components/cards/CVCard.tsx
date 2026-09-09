"use client";
/** CV card: a plain link to the static PDF. No tracking, no wrapped link (invariant 10). */
import type { Locale } from "@/lib/tools/schema";
import CardShell, { CardButton } from "@/components/cards/CardShell";
import { t } from "@/components/console/strings";

export default function CVCard({ locale, href = "/cv.pdf" }: { locale: Locale; href?: string }) {
  return (
    <CardShell title={t("cardCv", locale)} footer={<CardButton href={href}>{t("downloadCv", locale)}</CardButton>}>
      <p className="opacity-70">
        {locale === "ar" ? "الـCV كامل، PDF، من غير أي تتبّع." : "The full CV as a PDF. No tracking on the link."}
      </p>
    </CardShell>
  );
}
