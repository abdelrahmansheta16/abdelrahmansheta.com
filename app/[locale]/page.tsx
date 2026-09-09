/** Home: the whole static spine in Server Components. Section ids match SECTIONS in lib/tools/schema.ts. */
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { pageMetadata } from "@/i18n/metadata";
import SiteHeader from "@/components/layout/SiteHeader";
import Hero from "@/components/spine/Hero";
import ProofGrid from "@/components/spine/ProofGrid";
import Timeline from "@/components/spine/Timeline";
import Projects from "@/components/spine/Projects";
import About from "@/components/spine/About";
import Contact from "@/components/spine/Contact";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({
    locale,
    path: "/",
    title: t("homeTitle"),
    description: t("homeDescription"),
    siteName: t("siteName"),
  });
}

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader locale={locale} path="/" />
      <main id="content" className="flex-1">
        <Hero locale={locale} />
        <ProofGrid locale={locale} />
        <Timeline locale={locale} />
        <Projects locale={locale} />
        <About locale={locale} />
        <Contact locale={locale} />
      </main>
    </>
  );
}
