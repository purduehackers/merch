# Fonts

PolySans Relax is a commercial font, so it isn't bundled here. Drop the font
files into this folder so the `@font-face` rule in `src/pages/index.astro` can
find them:

- `PolySans-Relax.woff2`
- `PolySans-Relax.woff`

Until these files exist, the page falls back to the system sans-serif.
