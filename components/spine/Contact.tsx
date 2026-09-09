/** Contact: the one allowed email address, LinkedIn, the message trigger and the booking link. */
import corpus from "@/lib/corpus/corpus.generated";
import { getTranslations } from "next-intl/server";
import ConsoleTrigger from "./ConsoleTrigger";

export default async function Contact({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "contact" });
  const { links } = corpus;
  const hasCal = links.cal_link.trim().length > 0;

  return (
    <section id="contact" className="mx-auto max-w-5xl px-5 py-16">
      <h2 className="text-2xl font-semibold tracking-tight">{t("title")}</h2>
      <p className="mt-2 max-w-[var(--measure)] text-muted">{t("lede")}</p>

      <ul className="mt-6 space-y-2 text-sm">
        <li>
          <span className="me-2 text-muted">{t("email")}:</span>
          <a className="text-accent hover:underline" href={`mailto:${links.contact_email}`}>
            <bdi className="latin">{links.contact_email}</bdi>
          </a>
        </li>
        <li>
          <span className="me-2 text-muted">{t("linkedin")}:</span>
          <a className="text-accent hover:underline" href={links.linkedin} rel="me noopener">
            <bdi dir="ltr" className="latin">
              {links.linkedin.replace("https://www.", "")}
            </bdi>
          </a>
        </li>
      </ul>

      <div className="mt-6 flex flex-wrap gap-3">
        <ConsoleTrigger
          mode="text"
          prompt={t("leaveMessagePrompt")}
          className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:border-accent"
        >
          {t("leaveMessage")}
        </ConsoleTrigger>
        {hasCal ? (
          <a
            href={links.cal_link}
            rel="noopener"
            className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:border-accent"
          >
            {t("bookCall")}
          </a>
        ) : null}
      </div>
    </section>
  );
}
