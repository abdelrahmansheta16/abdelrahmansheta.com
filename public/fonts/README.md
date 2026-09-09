# Fonts for the OG image

`app/[locale]/opengraph-image.tsx` renders through Satori, which needs raw font files — it cannot use
`next/font`. Drop these two files here to get branded OG images:

- `IBMPlexSans-SemiBold.ttf`
- `IBMPlexSansArabic-SemiBold.ttf`

Both are optional. Without them the OG image falls back to Satori's built-in font, and the Arabic
variant renders the English copy rather than tofu boxes. Neither file is committed; add them locally
or in CI before deploy.
