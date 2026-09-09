"use client";
/**
 * The conversation log. One list for voice and text: a voice turn is appended to the same message array
 * the text path uses, so there is never a second, competing transcript. Each turn carries its own
 * lang/dir from a script heuristic, and Arabic turns switch to the Arabic font at 1.8 line-height.
 */
import { useEffect, useRef } from "react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import type { Locale } from "@/lib/tools/schema";
import type { ConsoleCorpus } from "@/components/console/types";
import { detectLocale, dirFor } from "@/lib/client/lang";
import { t } from "@/components/console/strings";
import Markdown from "@/components/console/Markdown";
import ToolPart from "@/components/console/ToolPart";

function messageText(message: UIMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .trim();
}

export default function Transcript({
  messages,
  locale,
  corpus,
}: {
  messages: UIMessage[];
  locale: Locale;
  corpus: ConsoleCorpus;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label={t("transcriptLabel", locale)}
      className="flex-1 space-y-4 overflow-y-auto px-4 py-3 text-sm"
    >
      {messages.map((message) => {
        const turnLocale = detectLocale(messageText(message));
        const speaker = message.role === "user" ? t("you", turnLocale) : t("agent", turnLocale);
        return (
          <article
            key={message.id}
            lang={turnLocale}
            dir={dirFor(turnLocale)}
            className={turnLocale === "ar" ? "font-[family-name:var(--font-arabic,inherit)] leading-[1.8]" : ""}
          >
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-50">{speaker}</p>
            <div className="space-y-2">
              {message.parts.map((part, index) => {
                if (part.type === "text") {
                  return <Markdown key={index} source={part.text} locale={turnLocale} />;
                }
                if (isToolUIPart(part)) {
                  return (
                    <ToolPart
                      key={index}
                      name={getToolName(part)}
                      state={part.state}
                      input={part.input}
                      errorText={part.state === "output-error" ? part.errorText : undefined}
                      corpus={corpus}
                      locale={turnLocale}
                    />
                  );
                }
                return null;
              })}
            </div>
          </article>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
