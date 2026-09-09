/** Localised 404 for anything under /[locale]. */
import { getTranslations, getLocale } from "next-intl/server";
import Link from "next/link";
import { pathFor } from "@/i18n/routing";

export default async function LocaleNotFound() {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "notFound" });

  return (
    <main id="content" className="mx-auto flex max-w-3xl flex-1 flex-col justify-center px-5 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-3 text-muted">{t("lede")}</p>
      <p className="mt-6">
        <Link href={pathFor(locale, "/")} className="text-accent hover:underline">
          {t("home")}
        </Link>
      </p>
    </main>
  );
}
