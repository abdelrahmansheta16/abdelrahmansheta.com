/** Per-request next-intl config: resolves the locale from the [locale] segment and loads its messages. */
import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    timeZone: "Africa/Cairo",
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
