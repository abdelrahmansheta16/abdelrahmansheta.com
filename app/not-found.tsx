/**
 * Global 404 for requests that never reached the [locale] segment. It renders outside the locale
 * layout, so it carries its own <html>/<body> and is English-only on purpose.
 */
import Link from "next/link";
import "./globals.css";

export default function GlobalNotFound() {
  return (
    <html lang="en" dir="ltr" className="h-full">
      <body className="flex min-h-full flex-col items-center justify-center gap-3 bg-bg px-5 text-fg">
        <h1 className="text-3xl font-semibold tracking-tight">That page does not exist</h1>
        <p className="text-muted">The link may be old, or I may have moved something.</p>
        <Link href="/" className="text-accent hover:underline">
          Back to the homepage
        </Link>
      </body>
    </html>
  );
}
