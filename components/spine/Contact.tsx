/** Contact: the one allowed email address, LinkedIn, the message trigger and the booking link. */
import corpus from "@/lib/corpus/corpus.generated";
import { getTranslations } from "next-intl/server";
import { usableLink } from "@/lib/corpus/placeholders";
import ConsoleTrigger from "./ConsoleTrigger";
import Reveal from "@/components/motion/Reveal";
import SectionHeading from "@/components/spine/SectionHeading";
import MeshBackdrop from "@/components/motion/MeshBackdrop";

export default async function Contact({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "contact" });
  const { links } = corpus;
  // Not merely "non-empty": an unfilled field still holds its "OWNER TO FILL: ..." placeholder, and
  // rendering the primary call-to-action with that sentence as its href sends a recruiter nowhere.
  const calLink = usableLink(links.cal_link);

  return (
    // The last section closes the page, so it gets the mesh back — the visitor ends where they began.
    <section id="contact" className="relative isolate overflow-hidden px-5 py-24">
      <MeshBackdrop grain={false} />
      <div className="mx-auto max-w-5xl">
      <SectionHeading title={t("title")} lede={t("lede")} />

      <ul className="mt-8 space-y-2 text-sm">
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
          className="glow-hover rounded-full btn-gradient px-5 py-2.5 text-sm font-semibold"
        >
          {t("leaveMessage")}
        </ConsoleTrigger>
        {calLink !== undefined ? (
          <a
            href={calLink}
            rel="noopener"
            className="rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:border-accent hover:text-accent"
          >
            {t("bookCall")}
          </a>
        ) : null}
      </div>
      </div>
    </section>
  );
}
