/**
 * Next 16 proxy (the former `middleware.ts`). Only job on this branch: next-intl locale negotiation.
 * The admin gate is added by the area that owns /admin.
 */
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals, the admin gate, file-based metadata routes and any static file.
  matcher: ["/((?!api|_next|_vercel|admin|.*opengraph-image|.*\\..*).*)"],
};
