/**
 * Server-rendered header: wordmark, section links and the locale switch.
 * `path` is the locale-less path of the current page so the switch can stay on the same page
 * without any client JS.
 */
import Link from "next/link";
import { pathFor, routing } from "@/i18n/routing";
import { getTranslations } from "next-intl/server";

export default async function SiteHeader({ locale, path }: { locale: string; path: string }) {
  const t = await getTranslations({ locale, namespace: "nav" });
  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  const links = [
    { href: pathFor(locale, "/cv"), label: t("cv") },
    { href: pathFor(locale, "/architecture"), label: t("architecture") },
    { href: pathFor(locale, "/privacy"), label: t("privacy") },
  ];

  return (
    <header className="sticky top-0 z-30 bg-bg/80 backdrop-blur-md after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-grad-a/60 after:to-transparent">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-5">
        <Link
          href={pathFor(locale, "/")}
          className="text-sm font-semibold tracking-tight transition-colors hover:text-accent"
        >
          Abdelrahman&nbsp;Sheta
        </Link>
        <nav aria-label={t("primary")} className="flex items-center gap-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-2.5 py-1.5 text-muted transition-colors hover:bg-bg-raised hover:text-fg"
            >
              {l.label}
            </Link>
          ))}
          <Link
            href={pathFor(other, path)}
            hrefLang={other}
            lang={other}
            className="ms-1 rounded-md border border-border px-2.5 py-1.5 text-muted transition-colors hover:border-accent hover:text-fg"
          >
            {other === "ar" ? t("switchToArabic") : t("switchToEnglish")}
          </Link>
        </nav>
      </div>
    </header>
  );
}
