"use client";
/**
 * Shown when an embedded webview (LinkedIn, Instagram, Gmail, ...) refuses the microphone. It never
 * blocks: the conversation continues by text behind it, and this only offers the two escapes that work.
 */
import { useState } from "react";
import type { Locale } from "@/lib/tools/schema";
import type { UaClass } from "@/lib/client/inapp";
import { t } from "@/components/console/strings";

const LABELS: Partial<Record<UaClass, string>> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  messenger: "Messenger",
  tiktok: "TikTok",
  snapchat: "Snapchat",
  wechat: "WeChat",
  gmail: "Gmail",
  outlook: "Outlook",
};

export default function InAppBrowserSheet({
  uaClass,
  locale,
  onDismiss,
}: {
  uaClass: UaClass;
  locale: Locale;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "" : window.location.href;
  const app = LABELS[uaClass];

  return (
    <div className="border-t border-amber-500/40 bg-amber-50 p-4 text-sm dark:bg-amber-950/40">
      <p className="mb-2 font-medium">
        {app ? `${app}: ` : ""}
        {t("micDenied", locale)}
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          className="rounded-lg border border-black/15 px-3 py-1.5 dark:border-white/20"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("openInSafari", locale)}
        </a>
        <button
          type="button"
          className="rounded-lg border border-black/15 px-3 py-1.5 dark:border-white/20"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? t("copied", locale) : t("copyLink", locale)}
        </button>
        <button type="button" className="rounded-lg px-3 py-1.5 underline" onClick={onDismiss}>
          {t("typeInstead", locale)}
        </button>
      </div>
    </div>
  );
}
