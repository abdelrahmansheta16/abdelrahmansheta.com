# Design of the spine

The spine is the server-rendered part of the site: everything you can read with JavaScript disabled.
It renders from two sources only — `lib/corpus/corpus.generated.ts` for facts and
`messages/{en,ar}.json` for UI strings. No component on the spine hardcodes content.

## Tokens

Defined once in `app/globals.css` under `:root` and re-exported to Tailwind through `@theme inline`,
so `bg-bg`, `text-muted`, `border-border` and `text-accent` all resolve to the same variables.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0b0b0c` | page background |
| `--bg-raised` | `#121214` | cards, chips, header on scroll |
| `--bg-sunken` | `#080809` | footer |
| `--fg` | `#ededef` | body text |
| `--muted` | `#9a9aa2` | secondary text, labels (7.1:1 on `--bg`) |
| `--border` | `#26262b` | hairlines, card edges (decorative only) |
| `--accent` | `#e8a33d` | the one warm accent: focus ring, links, metrics, the orb (9.1:1 on `--bg`) |
| `--accent-soft` | `#2a1f0d` | metric pills behind accent text |
| `--font-latin` | IBM Plex Sans 400/500/600 | Latin copy |
| `--font-arabic` | IBM Plex Sans Arabic 400/500/600 | Arabic copy |
| `--measure` | `68ch` | maximum line length for prose |

Contrast: every text/background pair in the table clears 4.5:1; `--muted` and `--accent` clear 7:1.
There is exactly one accent. Nothing else is coloured.

## Type scale

| Role | Latin | Arabic |
|---|---|---|
| Body | 16px / 1.6 | 15px / 1.8 |
| `h1` | 36–48px, `tracking-tight` | same size, **no** tracking |
| `h2` | 24px | 24px |
| Section lede | 16px, `--muted` | 15px, `--muted` |
| Meta / labels | 12–13px, uppercase for `dt` | 12–13px, never uppercased |

Arabic never carries letter-spacing: `globals.css` forces `letter-spacing: normal !important` under
`[lang="ar"]` so a stray Tailwind `tracking-*` cannot leak in. Digits use the `.num` class, which
isolates the run (`unicode-bidi: isolate; direction: ltr`) so numbers are never mirrored in RTL.

## Spacing and layout

One container: `mx-auto max-w-5xl px-5` (prose pages use `max-w-3xl`). Sections are `py-16`;
the hero is `pt-14 pb-20`. Cards are `rounded-xl border p-4`/`p-5`. All directional spacing uses
logical utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`) so RTL needs no overrides; the one
physical transform, the timeline bullet, is corrected with `rtl:translate-x-1/2`.
`[id] { scroll-margin-top: 5rem }` keeps anchors clear of the sticky header when the agent's
`show_section` tool scrolls the page.

## Component inventory

| Component | Kind | Notes |
|---|---|---|
| `components/layout/SkipLink` | server | visually hidden until focused, targets `#content` |
| `components/layout/SiteHeader` | server | takes a locale-less `path` so the language switch is a plain `<a>` — zero client JS |
| `components/layout/SiteFooter` | server | rights line, contact email, LinkedIn, GitHub |
| `components/spine/Hero` | server | name, headline, the cloned-voice line, `#agent-orb` mount, `{/* CONSOLE_MOUNT */}`, two triggers, four prompt chips |
| `components/spine/ProofGrid` | server | one card per proof point, each with `data-proof-id` |
| `components/spine/Timeline` | server | `corpus.profile.roles` |
| `components/spine/Projects` | server | card ids are `project-<slug>` |
| `components/spine/About` | server | logistics table plus `public/photo.jpg`, or a neutral SVG when absent |
| `components/spine/Contact` | server | the one allowed email, LinkedIn, message trigger, Cal link when set |
| `components/spine/JsonLd` | server | Person + WebSite site-wide, ProfilePage on `/cv` |
| `components/spine/ConsoleTrigger` | **client** | the only client component on the spine |

### The console boundary

The spine never imports the console or the orb. It offers three things and nothing else:

1. `<div id="agent-orb" />` in the hero — the orb mounts into it.
2. A `{/* CONSOLE_MOUNT */}` comment at the end of the hero — the merge inserts the console there.
3. A `console:open` window `CustomEvent` with `{ mode: 'voice' | 'text', prompt?: string }`, typed in
   `components/spine/consoleEvents.ts` (which also augments `WindowEventMap`, so the listener side is
   typed too).

## Locale and RTL

`next-intl` with `localePrefix: 'as-needed'`: `/` is English, `/ar` is Arabic. Detection is cookie
first (`NEXT_LOCALE`), then `Accept-Language`, in `proxy.ts` (Next 16's rename of `middleware.ts`).
`app/[locale]/layout.tsx` is the root layout so `<html lang dir>` can be locale-aware; the global
`app/not-found.tsx` therefore ships its own `<html>` and is English-only by design.

Corpus facts (proof claims, achievements, project bodies, stack lists) are authored in English. On
`/ar` they are wrapped in `<bdi dir="ltr">` so they keep the Latin face and read left to right inside
the RTL column, instead of being machine-translated into something the owner never said. Only the
strings the corpus supplies in both languages — logistics status, market notes, interview preferences
— actually switch language.

## Performance and accessibility

- Every route is prerendered (`generateStaticParams` over both locales); the only client bundle on
  the spine is `ConsoleTrigger`.
- Landmarks: `header` / `main#content` / `footer`, one `h1` per page, `nav` labelled from messages.
- `:focus-visible` draws a 2px accent ring with a 3px offset on every interactive element.
- `prefers-reduced-motion: reduce` kills animation, transition and smooth scrolling.
- The About photo is optional: `public/photo.jpg` when present, otherwise an inline SVG with an
  accessible name. It is one small portrait, never the hero.

## Build notes

- `pnpm build` runs `compile:corpus` first, which needs the private corpus repo. To build only the
  spine, run `npx next build` with a local `lib/corpus/corpus.generated.ts` in place (it is gitignored).
- `npx next typegen` must run once before `pnpm typecheck` so the `PageProps`/`LayoutProps` globals exist.
- OG images need raw TTFs in `public/fonts` — see `public/fonts/README.md`. They degrade gracefully.
