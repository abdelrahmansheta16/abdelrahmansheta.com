/**
 * Per-locale 1200x630 OG image. Satori is flexbox-only: no grid, no CSS variables, explicit display.
 * The Arabic variant needs an Arabic-capable TTF in public/fonts; when it is absent we fall back to
 * the Latin copy rather than render tofu.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Abdelrahman Sheta — AI engineer";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

async function loadFont(file: string): Promise<ArrayBuffer | null> {
  try {
    const buf = await fs.readFile(path.join(process.cwd(), "public", "fonts", file));
    return new Uint8Array(buf).buffer;
  } catch {
    return null;
  }
}

export default async function OpengraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isArabic = locale === "ar";

  const arabicFont = isArabic ? await loadFont("IBMPlexSansArabic-SemiBold.ttf") : null;
  const latinFont = await loadFont("IBMPlexSans-SemiBold.ttf");

  // Without an Arabic face we cannot draw Arabic glyphs, so fall back to the English copy.
  const useArabic = isArabic && arabicFont !== null;
  const t = await getTranslations({ locale: useArabic ? "ar" : "en", namespace: "og" });
  const meta = await getTranslations({ locale: useArabic ? "ar" : "en", namespace: "meta" });

  const fonts = [
    ...(arabicFont ? [{ name: "Plex", data: arabicFont, weight: 600 as const, style: "normal" as const }] : []),
    ...(latinFont ? [{ name: "Plex", data: latinFont, weight: 600 as const, style: "normal" as const }] : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0b0b0c",
          color: "#ededef",
          padding: 72,
          direction: useArabic ? "rtl" : "ltr",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 20, height: 20, borderRadius: 20, backgroundColor: "#e8a33d" }} />
          <div style={{ display: "flex", fontSize: 26, color: "#9a9aa2" }}>{t("cta")}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 86, letterSpacing: useArabic ? 0 : -2 }}>
            {meta("siteName")}
          </div>
          <div style={{ display: "flex", marginTop: 20, fontSize: 34, color: "#9a9aa2" }}>
            {t("tagline")}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 26, color: "#9a9aa2" }}>abdelrahmansheta.com</div>
      </div>
    ),
    { ...size, ...(fonts.length > 0 ? { fonts } : {}) },
  );
}
