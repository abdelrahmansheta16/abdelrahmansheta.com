/**
 * Next config: wires the next-intl plugin to i18n/request.ts, and BotID over the whole app.
 *
 * `withBotId` is what installs the client challenge and the rewrites that let `checkBotId()` reach a
 * verdict. Without it the `botid` dependency is inert: `app/api/_lib/http.ts:isHuman()` calls
 * `checkBotId()` and swallows the failure, so every `isHuman()` gate in front of every paid endpoint
 * was returning true for everyone. The protected routes are declared in the root layout.
 */
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withBotId } from "botid/next/config";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default withBotId(withNextIntl(nextConfig));
