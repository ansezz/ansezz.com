# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## Project

**ansezz.com** — personal portfolio + blog of Anass Ez-zouaine. Static site. Astro 6 + Tailwind CSS v4 + TypeScript (strict). Neobrutalist design language.
Package manager: `pnpm` (pinned via `packageManager` in `package.json`).
Deploy target: **Cloudflare Pages** (project `ansezz-com`, custom domain `ansezz.com`). Auto-deploys on push to `main`.

## Commands

| Command                | Action                                                    |
| ---------------------- | --------------------------------------------------------- |
| `pnpm install`         | Install deps                                              |
| `pnpm dev`             | Dev server at `localhost:4321`                            |
| `pnpm build`           | Build to `./dist/`, then `pagefind --site dist`           |
| `pnpm preview`         | Preview built site                                        |
| `pnpm check`           | Type-check `.astro` + TS (run before declaring work done) |
| `pnpm lighthouse`      | Lighthouse CI against `dist/` — run `pnpm build` first    |
| `pnpm format`          | Prettier across repo                                      |
| `pnpm optimize:images` | Sharp pass over images in `public/blog`                   |
| `pnpm generate:icons`  | Regenerate PWA + apple-touch icons                        |

No test runner. No lint command — `astro check` enforces types; Prettier formats via `.prettierrc.json` (`prettier-plugin-astro` + `prettier-plugin-tailwindcss`). Both plugins must stay listed there — Prettier 3 does not auto-load them, and without the config `.astro` files are silently skipped.

Search is Pagefind, indexed as a post-`astro build` step. It is therefore **inert in `pnpm dev`** and only live against a real build.

## Architecture

Content-driven static site. Three pillars:

1. **Content collections** (`src/content.config.ts`) — `blog` and `work` defined via `glob` loader, schemas validated with `astro/zod`. Markdown/MDX files live in `src/content/blog/` (71 posts) and `src/content/work/` (26 entries). Editing schema = updating frontmatter across all entries.

2. **Pages** (`src/pages/`) — file-based routing.
   - Blog: `blog/[...slug].astro`, plus `blog/category/[category].astro`, `blog/tag/[tag].astro`, `blog/page/[page].astro`, `blog/series/index.astro`, `blog/series/[series].astro`.
   - Work: `work.astro` index + `work/[...slug].astro` (generated **only** for `featured` entries).
   - Tools: `tools/index.astro` + 23 tool pages, each pairing with a `src/scripts/<tool>.ts`.
   - Static: `about`, `services`, `uses`, `contact`, `now`, `library`, `feed`, `privacy`, `styleguide`, `404`.
   - Endpoints: `rss.xml.js`, `rss/[category].xml.js`, `feed.json.ts`, `resume.json.ts`, and generated OG cards under `og/**/*.png.ts`.

3. **Site config** (`src/consts.ts`) — single source of truth. `CAREER_SINCE`/`REMOTE_SINCE` + derived `YEARS_EXPERIENCE`/`YEARS_REMOTE`, `SITE`, `OWNER`, `AVAILABLE_FOR`, `STATS`, `SOCIALS`, `X_HANDLE`, `NAV`, `FOOTER_MORE`, `HOME`, `ABOUT`, `WORK`, `BLOG`, `TAG_OG_MIN_POSTS`, `START_HERE`, `USES`, `CONTACT`, `CONTACT_FORM`, `BLOG_SERIES`, `BLOG_CATEGORIES`, `CATEGORY_LABEL`, `CATEGORY_TONE`, `CARD_TONES`, `WHAT_I_DO`, `SERVICES`, `LANGUAGES`, `SERVICES_PAGE`, `SERVICES_FAQ`, `TESTIMONIALS`, `NOW`, `TOOLS`, `TOOL_GROUPS`, `TOOL_LIST`, `LIBRARY`, `LIBRARY_GROUPS`, `COMMENTS`, `OTHER_SHOPIFY_STOREFRONTS`, `OTHER_SHOPIFY_APPS`, `OTHER_PLATFORMS`. `astro.config.mjs` imports `SITE` and `TAG_OG_MIN_POSTS` from it.

### Key wiring

- `astro.config.mjs` — declares Google fonts via `fontProviders.google()`:
  - `--font-display` (Archivo Black)
  - `--font-sans` (Inter)
  - `--font-mono` (JetBrains Mono)
    Also: sitemap (with `lastmod` read from blog frontmatter, and thin tag pages filtered out), MDX, astro-icon, `@vite-pwa/astro`, and a rehype chain (`rehype-slug` → `rehype-autolink-headings` → `rehype-image-dims` → `rehype-external-links`). Tailwind v4 loaded as a Vite plugin (no `tailwind.config.js`).
- `tsconfig.json` — extends `astro/tsconfigs/strict`, path alias `@/*` → `src/*`.
- `src/layouts/BaseLayout.astro` — outer shell (head + `Header` + `Footer` + `CommandPalette` + JSON-LD). Accepts `noindex` and an explicit `robots` override.
- `src/layouts/Page.astro` — wraps BaseLayout, adds eyebrow + heading + intro shell, auto-emits `WebPage` JSON-LD and resolves a per-page OG card via `lib/og-pages`.
- `src/styles/global.css` — Tailwind v4 entry (`@import "tailwindcss"`) + `@theme` tokens (colors, shadows, type scale, halftone utilities).
- `src/lib/` — `seo` (JSON-LD builders), `links` (`externalLinkAttrs`, `tagSlug`), `reading`, `series`, `og` + `og-pages` (card generation), `rehype-image-dims`.

### Client-side scripts — read this before adding one

`<ClientRouter />` (view transitions) is enabled sitewide. On navigation Astro re-inserts `<script src=…>` tags, but the browser will **not** re-execute an already-loaded module URL. A script that binds listeners to elements at module top level therefore works on first load and is dead after the first client-side navigation, because the DOM it bound to has been replaced.

Every file in `src/scripts/` must do one of:

- **document-level delegation** (`mobile-menu`, `theme-toggle`, `command-palette`, `share-bar`), or
- **guarded re-init** — `init(); document.addEventListener("astro:after-swap", init);` with a `dataset.bound`/`dataset.ready` guard so a repeat call is a no-op (`jwt-decoder`, `uuid-generator`, `work-filter`, `table-of-contents`, …).

A page's `<script>` block should contain nothing but `import "@/scripts/<name>";`.

### Adding content

- **Blog post**: drop `.md`/`.mdx` in `src/content/blog/` matching the schema:
  - required: `title`, `description`, `publishDate`, `category` (one of `BLOG_CATEGORIES`)
  - optional: `updatedDate`, `tags[]`, `featured`, `draft`, `heroImage` (`{ url, alt }` — an **object**, not a string)
  - images go in `public/blog/<post-id>/`; tags are lowercase-kebab and should reuse an existing tag where one fits (tags with < `TAG_OG_MIN_POSTS` posts are `noindex,follow` and sitemap-excluded)
  - to place it in a reading path, add its id to a `BLOG_SERIES` entry — a post belongs to **at most one** series
- **Work entry**: drop `.md`/`.mdx` in `src/content/work/` matching the schema:
  - required: `title`, `description`, `category` (`ai` | `shopify` | `saas`)
  - optional: `stack[]`, `outcome`, `liveUrl`, `githubUrl`, `order`, `featured`
  - `order` must be unique within a category, or sort order is nondeterministic
  - `featured: true` generates `/work/<slug>/`, so it needs a Markdown body; non-featured entries render as cards only and can have an empty body
- **New page**: add `.astro` under `src/pages/`. Use `Page.astro` for standard pages, `BaseLayout.astro` for custom hero shells. Add it to `NAV` or `FOOTER_MORE` in `consts.ts` so it's linked, and to `PAGE_OG` in `lib/og-pages.ts` if it deserves a branded OG card.

## Design system

Neobrutalist primitives live in `src/components/neobrutalist/` — `NeoCard`, `NeoButton`, `TagPill`, `TagPillRow`, `BurstBadge`, `SpeechBubble`, `StickyNote`, `PanelDivider`, `HalftoneSection`, `ChecklistBox`, `ComparisonTable`, `CodeBlock`, `RobotMascot`, `PageNumber`, `AvailabilityBadge`, `SocialButton`. Every variant is rendered live at `/styleguide/`.

Composites: `src/components/home/*`, `src/components/blog/*`, `src/components/work/ProjectCard.astro`, `src/components/layout/*`, and the shared `src/components/RelatedLinks.astro` (used for "Keep reading" blocks on tool pages).

## Conventions

- Path alias `@/*` resolves to `src/*` — prefer over relative `../../`.
- Astro `<style>` blocks are scoped by default. Global styles + tokens go in `src/styles/global.css`.
- Font usage: reference CSS vars `var(--font-display)` / `var(--font-sans)` / `var(--font-mono)`, or Tailwind utility classes `font-display`, `font-sans`, `font-mono`.
- Zod v4 syntax in schemas (`z.url()`, `z.coerce.date()`).
- Tailwind v4 — colors are CSS vars (`bg-yellow`, `text-ink`). Shadows are utilities (`shadow-neo-xs/sm/md/lg/xl`). No `tailwind.config.js`.
- Use `NeoCard` instead of hand-rolling bordered cards. Use `Page` layout for routine pages.
- The header's desktop nav needs ~932px, so it switches at `lg:`, not `md:`. `src/scripts/mobile-menu.ts` has a matching `matchMedia` query — change both together.
- Dynamic Tailwind classes (e.g. `bg-${tone}`) do not work — use static lookup maps (`Record<Tone, string>`).
- **Coloured surfaces need a pinned foreground.** `--color-ink`/`--color-paper`/`--color-bg` invert between themes, but the accents (`yellow`, `cyan`, `green`, `red`, `pink`, `purple`, `blue`) do not. So `bg-ink text-bg` is correct, while `bg-yellow text-ink` collapses to ~1.4:1 in dark mode. Pair bright accents with `text-on-accent` and deep ones (purple/blue) with `text-on-deep`; both are theme-invariant. A tone map that sets a background but no foreground is a bug.
- Grid and flex items default to `min-width: auto`, so a `truncate`/`whitespace-nowrap` descendant forces the track to its full text width and the card overflows the viewport. Card-grid `<li>`s carry `min-w-0`.
- External links go through `externalLinkAttrs()` from `@/lib/links`, not hand-written `target`/`rel`.
- Never hardcode a number that `consts.ts` already derives (years of experience, post counts, tag counts) — they drift.
- Don't render the same component twice with a fixed `id`; two `<ThemeToggle />` instances is why that hook is `[data-theme-toggle]`.

### SEO rules that are load-bearing

- One canonical answer per question: `FAQPage` schema lives on `/services/` only. `/contact/`'s FAQ is contact-flow specific and carries no `FAQPage`.
- Tag pages below `TAG_OG_MIN_POSTS` (3) are `noindex,follow` and excluded from the sitemap — the threshold is applied in **both** `blog/tag/[tag].astro` and `astro.config.mjs`. Change one, change the other.
- No analytics or third-party trackers. The CSP in `public/_headers` allows exactly giscus and Web3Forms; adding a script means widening the CSP **and** updating `/privacy/`.

## Deploy

**Cloudflare Pages** auto-deploys on push to `main`. No GitHub Actions configured — Cloudflare runs `pnpm install --frozen-lockfile && pnpm build` against `dist/` directly.

Required Cloudflare settings:

- **Build image: v3** (Settings → Build & deployments → Build image). Older images ship Node 18; the site targets Node 24 LTS.
- **Env var**: `NODE_VERSION=24`
- Framework preset: Astro
- Build output dir: `dist`

Repo pins: `.nvmrc` (24) + `.node-version` (24) select the **Node 24 LTS** runtime for deploys; `package.json` `engines.node` is the broader compatibility floor (`>=22.12.0`, so local dev on 22 still works) + `packageManager` (pnpm@11.8.0). `engine-strict=true` in `.npmrc`. `public/_headers` + `public/_redirects` honored automatically.
