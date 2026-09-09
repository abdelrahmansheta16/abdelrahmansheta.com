/** Keyboard-first skip link. Visually hidden until focused. */
export default function SkipLink({ label }: { label: string }) {
  return (
    <a
      href="#content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[#0b0b0c]"
    >
      {label}
    </a>
  );
}
