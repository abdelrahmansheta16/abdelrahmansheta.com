/** Structured data: Person + WebSite site-wide, ProfilePage on /cv. Emitted as a plain script tag. */
import corpus from "@/lib/corpus/corpus.generated";
import { absoluteUrl, SITE_URL } from "@/i18n/metadata";

function Script({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // Escape the sequences that can break out of a <script> block or a JS string literal.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data)
          .replace(/</g, "\\u003c")
          .replace(/\u2028/g, "\\u2028")
          .replace(/\u2029/g, "\\u2029"),
      }}
    />
  );
}

export function PersonAndWebSiteJsonLd({ locale }: { locale: string }) {
  const { profile, links } = corpus;
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${SITE_URL}#person`,
    name: profile.name,
    jobTitle: profile.headline,
    url: SITE_URL,
    address: { "@type": "PostalAddress", addressLocality: "Cairo", addressCountry: "EG" },
    sameAs: [links.linkedin, links.github],
    knowsLanguage: ["ar", "en"],
    email: `mailto:${links.contact_email}`,
  };
  const website = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}#website`,
    url: SITE_URL,
    name: profile.name,
    inLanguage: locale,
    author: { "@id": `${SITE_URL}#person` },
  };
  return (
    <>
      <Script data={person} />
      <Script data={website} />
    </>
  );
}

export function ProfilePageJsonLd({ locale }: { locale: string }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: absoluteUrl(locale, "/cv"),
    inLanguage: locale,
    mainEntity: { "@id": `${SITE_URL}#person` },
  };
  return <Script data={data} />;
}
