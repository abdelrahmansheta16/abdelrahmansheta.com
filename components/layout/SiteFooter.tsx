/** Server-rendered footer: rights line, contact and the source links. */
import corpus from "@/lib/corpus/corpus.generated";
import { getTranslations } from "next-intl/server";

export default async function SiteFooter({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "footer" });
  const c = await getTranslations({ locale, namespace: "contact" });
  const year = 2026;

  return (
    <footer className="border-t border-border/70 bg-bg-sunken">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="num">© {year}</span> {corpus.profile.name}. {t("rights")}
        </p>
        <ul className="flex flex-wrap items-center gap-4">
          <li>
            <a className="hover:text-fg" href={`mailto:${corpus.links.contact_email}`}>
              <bdi className="latin">{corpus.links.contact_email}</bdi>
            </a>
          </li>
          <li>
            <a className="hover:text-fg" href={corpus.links.linkedin} rel="me noopener">
              {c("linkedin")}
            </a>
          </li>
          <li>
            <a className="hover:text-fg" href={corpus.links.github} rel="me noopener">
              {c("github")}
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
