# ansezz.com

```
 █████╗ ███╗   ██╗███████╗███████╗███████╗███████╗
██╔══██╗████╗  ██║██╔════╝██╔════╝╚══███╔╝╚══███╔╝
███████║██╔██╗ ██║███████╗█████╗    ███╔╝   ███╔╝
██╔══██║██║╚██╗██║╚════██║██╔══╝   ███╔╝   ███╔╝
██║  ██║██║ ╚████║███████║███████╗███████╗███████╗
╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝╚══════╝╚══════╝
```

> Personal portfolio + blog of **Anass Ez-zouaine** — Senior Lead Backend Engineer · Software Architect · AI Engineer.
> Comic-book editorial **neobrutalism**. Thick borders. Hard shadows. Zero gradients.

[![Built with Astro](https://img.shields.io/badge/Built_with-Astro_6-FF5D01?style=flat-square&logo=astro&logoColor=white&labelColor=0a0a0a)](https://astro.build)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-v4-38BDF8?style=flat-square&logo=tailwindcss&logoColor=white&labelColor=0a0a0a)](https://tailwindcss.com)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white&labelColor=0a0a0a)](https://www.typescriptlang.org/)
[![License MIT](https://img.shields.io/badge/License-MIT-FFD93D?style=flat-square&labelColor=0a0a0a)](#license)

---

## ▸ What this is

A static site for [**ansezz.com**](https://ansezz.com): shipped work, writing on Laravel + AI + Shopify, 23 free browser-only engineering tools, and how to start a conversation. Astro 6 with content collections, full SEO/JSON-LD, sitemap, RSS + JSON Feed, generated OG cards, Pagefind search, and a hand-rolled neobrutalist component library.

| Page            | Purpose                                                          |
| --------------- | ---------------------------------------------------------------- |
| `/`             | Trading-card hero, what I build, services, featured posts        |
| `/about/`       | By the numbers, 3-step process, principles, stack, languages     |
| `/work/`        | 26 case-study entries + 23 more live links, filterable by lane   |
| `/work/<slug>/` | Full case study — generated for `featured` entries only          |
| `/services/`    | Packages, how the engagement runs, FAQ (canonical `FAQPage`)     |
| `/blog/`        | 71 posts — search, start-here, categories, tag cloud, pagination |
| `/blog/series/` | 13 ordered reading paths                                         |
| `/tools/`       | 23 client-side tools, grouped into 6 sections                    |
| `/library/`     | Books, docs, and tools worth the time                            |
| `/now/`         | What has my attention this season                                |
| `/uses/`        | Daily drivers, stack lanes, what I dropped                       |
| `/feed/`        | Follow hub — RSS, JSON Feed, per-topic feeds, social profiles    |
| `/contact/`     | Contact flow, form, channels, contact-specific FAQ               |
| `/privacy/`     | Privacy notice                                                   |
| `/styleguide/`  | Internal — every component & token (`Disallow`-ed in robots.txt) |

Machine-readable endpoints: `/rss.xml`, `/rss/<category>.xml`, `/feed.json` (JSON Feed 1.1), `/resume.json` (JSON Resume), `/llms.txt`, `/sitemap-index.xml`.

---

## ▸ Stack

```
Astro 6              Static site generator + content collections
Tailwind CSS v4      In-CSS @theme tokens, no config file
TypeScript           Strict mode, path alias @/* → src/*
MDX + Shiki          Authoring + github-dark code highlighting
astro-icon           Lucide icon set, inline-rendered
Astro fonts          Archivo Black · Inter · JetBrains Mono, self-hosted
reading-time         Word count + estimated read on every post
Pagefind             Static full-text blog search (built post-`astro build`)
satori + resvg       Build-time OG card generation (per post/tag/series/page)
@vite-pwa/astro      Service worker + offline shell
@astrojs/sitemap     sitemap-index.xml + per-page priority/changefreq/lastmod
@astrojs/rss         /rss.xml + per-category feeds
sharp                Image optimization script
giscus               Blog comments (GitHub Discussions), loaded on demand
Web3Forms            Contact form delivery, no backend
```

**No analytics.** No tracking scripts, no pixels, no cookies set by the site — see [`/privacy/`](https://ansezz.com/privacy/). The only off-domain requests are giscus and Web3Forms, and only when you engage with them. The CSP in `public/_headers` is scoped to exactly those two.

---

## ▸ Design system

Hand-built neobrutalist primitives in `src/components/neobrutalist/` — 16 of them, every variant rendered live at [`/styleguide/`](https://ansezz.com/styleguide/):

```
NeoCard         9 tones × 4 shadow sizes × tilt & hover
NeoButton       primary | secondary | ghost | danger | ink — 3 sizes
TagPill         9 tones · active state · clickable variant
TagPillRow      scroll-on-mobile / sticky pill row
BurstBadge      3 sizes · 7 tones · explosive starbursts
SpeechBubble    4 tail positions · 5 tones
StickyNote      tilt prop, 4 paper-toned variants
PanelDivider    zigzag · bolt · burst · dots
HalftoneSection cyan/yellow/blue ben-day overlay backgrounds
ChecklistBox    titled, checked/unchecked items
ComparisonTable header × rows with icon + boolean cells
CodeBlock       Shiki-rendered with filename chrome
RobotMascot     4 tones, sized SVG mascot
PageNumber      magazine-style numerals (tl/tr/bl/br)
AvailabilityBadge · SocialButton
```

Composites live in `src/components/home/`, `src/components/blog/`, `src/components/work/`, `src/components/layout/`, plus a shared `RelatedLinks` block.

Tokens (in `src/styles/global.css` `@theme`):

- **Colors** — `bg`, `bg-alt`, `paper`, `ink`, `ink-soft`, `yellow`, `pink`, `pink-deep`, `cyan`, `green`, `red`, `blue`, `purple`
- **Shadows** — `shadow-neo-xs` (2px) → `shadow-neo-xl` (12px), all hard offset
- **Type** — clamp display scale, Archivo Black + Inter + JetBrains Mono

---

## ▸ Architecture

```
src/
├── components/
│   ├── neobrutalist/    16 design primitives
│   ├── home/            Hero, Stats, WhatIDo, Services, Testimonials,
│   │                    FeaturedPosts, SocialPreview, TaglineBand
│   ├── blog/            PostCard, PostMeta, ShareBar, ReadingProgress,
│   │                    TableOfContents, RelatedPosts, AuthorFooter,
│   │                    SeriesNav, Search, Comments
│   ├── work/            ProjectCard
│   ├── layout/          Header, Nav, Footer, ThemeToggle, CommandPalette
│   └── RelatedLinks.astro
├── content/
│   ├── blog/            71 × *.mdx
│   └── work/            26 × *.md
├── content.config.ts    zod schemas for both collections
├── layouts/             BaseLayout · Page
├── lib/                 seo · links · reading · series · og · og-pages ·
│                        rehype-image-dims
├── pages/               file-based routing (incl. /og/**/*.png endpoints)
├── scripts/             client-side behaviour, one file per feature
├── styles/global.css    Tailwind v4 entry + @theme tokens
└── consts.ts            single source of truth — SITE, OWNER, NAV, …
```

Path alias `@/*` resolves to `src/*`.

**Client-side scripts:** `<ClientRouter />` is enabled, and Astro does **not** re-execute a bundled module script after a view-transition swap. Every file in `src/scripts/` must therefore either use document-level event delegation or re-initialise on `astro:after-swap` (guarded so it's idempotent). Never bind listeners to elements from a top-level statement in a page's `<script>` block — it works on first load and dies on the next navigation.

---

## ▸ Commands

```bash
pnpm install            # one-time
pnpm dev                # localhost:4321  (search is inert — no Pagefind index)
pnpm build              # → dist/ then pagefind --site dist
pnpm preview            # serve dist/
pnpm check              # astro check + typescript
pnpm format             # prettier (astro + tailwind plugins via .prettierrc.json)
pnpm optimize:images    # sharp pass over public/blog
pnpm generate:icons     # PWA + apple-touch icons
```

No test runner, no lint command — `astro check` enforces types, Prettier enforces format.

---

## ▸ Content

**Blog post** — drop `.md` or `.mdx` in `src/content/blog/`:

```yaml
---
title: "Shopify Liquid vs headless — when to pick which"
description: "Decision tree for storefronts you actually have to ship."
publishDate: 2026-05-10
updatedDate: 2026-06-01 # optional
category: shopify # laravel | ai | shopify | devops | architecture | career
tags: [shopify, hydrogen, liquid] # lowercase-kebab
featured: false
draft: false
heroImage: # optional, but an object — not a string
  url: "/blog/liquid-vs-headless/hero.webp"
  alt: "Descriptive alt text"
---
```

Images live in `public/blog/<post-id>/`. To put the post in a reading path, add its id to a `BLOG_SERIES` entry in `src/consts.ts` — a post belongs to at most one series.

**Work entry** — drop `.md` in `src/content/work/`:

```yaml
---
title: "Claimify — warranty + returns claims for Shopify"
description: "One-sentence summary, 60–165 chars."
category: shopify # ai | shopify | saas
stack: ["Laravel", "Remix", "Polaris"]
outcome: "What changed for the client" # optional
liveUrl: "https://…" # optional
githubUrl: "https://…" # optional
order: 2 # unique within a category
featured: false # true ⇒ generates /work/<slug>/ and needs a body
---
```

Only `featured` entries get a detail page, so only they need Markdown below the frontmatter.

---

## ▸ Deploy — Cloudflare Pages

Connected to **Cloudflare Pages** project `ansezz-com`. Auto-deploys on push to `main` from GitHub. No GitHub Actions.

**Cloudflare Pages settings** (Settings → Build & deployments):

```
Build image:       v3              ← REQUIRED (v1 ships Node 18, this targets Node 24)
Framework preset:  Astro
Build command:     pnpm install --frozen-lockfile && pnpm build
Build output dir:  dist
Root directory:    /
```

**Environment variables** (Settings → Variables):

```
NODE_VERSION = 24
```

Repo-level pins (already committed):

- `.nvmrc` → `24`, `.node-version` → `24` — select the Node 24 LTS runtime
- `package.json` `engines.node` → `>=22.12.0` — the compatibility floor, so local dev on 22 still works
- `package.json` `packageManager` → `pnpm@11.8.0` (Cloudflare v3 detects this)
- `.npmrc` → `engine-strict=true`

`public/_headers` and `public/_redirects` are honored automatically — CSP, security headers, immutable cache rules, feed cache TTLs, and the 404 fallback all ship as-is.

Domain wiring (already live):

- Production: `ansezz.com` + `ansezz-com.pages.dev`
- DNS: `ansezz.com` proxied through Cloudflare (orange cloud)

**If a deploy fails** with `Node.js v18 is not supported`, the project is still on Build Image v1. Switch to v3 in Cloudflare dashboard → Settings → Build & deployments → Build image.

---

## ▸ SEO (shipped)

```
✓ Person + WebSite + ProfessionalService JSON-LD on home
✓ ProfilePage on /about, FAQPage on /services (canonical — not duplicated)
✓ BlogPosting + BreadcrumbList + related ItemList on every post
✓ CollectionPage/ItemList on /blog, /work, /tools, /blog/series
✓ Generated 1200×630 OG cards per post / tag / series / static page
✓ /sitemap-index.xml with per-page priority, changefreq, and lastmod
✓ RSS 2.0 (all + per category), JSON Feed 1.1, JSON Resume, llms.txt
✓ Canonical URLs, rel=prev/next on paginated blog pages, en lang
✓ Tag pages under 3 posts are noindex,follow and sitemap-excluded
✓ /robots.txt — disallows /styleguide/
```

---

## ▸ Style / contribution

- Prettier + `prettier-plugin-astro` + `prettier-plugin-tailwindcss`, configured in `.prettierrc.json`
- No lint command — `astro check` enforces types
- File org: many small files (≤ 400 lines) over few large ones
- Astro `<style>` blocks are scoped; global styles in `global.css`
- Don't add a Tailwind config — v4 reads `@theme` from CSS
- Dynamic Tailwind classes (`bg-${tone}`) don't work; use a static `Record<Tone, string>` lookup

---

## ▸ Credits

- **Astro** team for v6
- **Tailwind Labs** for v4's CSS-first approach
- **Lucide** icon set
- **Archivo Black** / **Inter** / **JetBrains Mono** typefaces

---

## License

MIT — fork it, ship your own portfolio. Just don't copy my face. ⚡

```
   ▸ Built with caffeine, Claude, and an unreasonable
     amount of border-[3px] border-ink shadow-neo-md.
```
