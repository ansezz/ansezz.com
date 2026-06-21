# Blog content writing guide — ansezz.com

You write the **Markdown (`.mdx`) content only**: YAML frontmatter + body. You don't run builds, touch the repo, or process images — just deliver clean, correct content. Follow these rules exactly; they keep every post valid, SEO-strong, and consistent with the existing posts.

The page shell — the title `<h1>`, the hero image, post meta, table of contents, breadcrumbs, share/comments — is rendered **automatically** from your frontmatter. **You only write frontmatter + body. Do not re-create the title or hero inside the body.**

---

## ⚠️ Non-negotiables (read first — these are the rules that keep getting broken)

1. **Start the file with a complete `---` frontmatter block.** It MUST contain all six: `title`, `description`, `publishDate`, `category`, `tags`, `heroImage`. Never start with a `# H1` or an image — those go in the frontmatter (`title` and `heroImage`).
2. **`category` is EXACTLY one lowercase word** from this list — nothing else: `laravel` · `ai` · `shopify` · `devops` · `architecture` · `career`. NOT `"AI"`, `"AI Engineering"`, `"Architecture"`. A wrong value breaks the deploy.
3. **`tags` are kebab-case lowercase:** `[rag, fine-tuning, vector-databases]`, never `[RAG, Fine-Tuning, Vector Databases]`.
4. **`heroImage` is required** — pick your lead image, reference it as `/blog/<slug>/hero.webp`, and do NOT also place it in the body.
5. **Internal links are root-relative WITH a trailing slash:** `[text](/blog/<slug>/)` — never `https://ansezz.com/blog/<slug>` and never without the trailing slash. Include at least one link to `/work/` or `/services/`.
6. **Sentence case** for the `title` and every `##`/`###` heading (capitalize only proper nouns + acronyms). Not Title Case.
7. **No `$LaTeX$` math** — the site doesn't render it. Use inline code: `P(y | x)`.
8. **Descriptive alt text** on every image (a short sentence, not a 2-word label).

Everything below expands on these. If you only remember one thing: **deliver a full frontmatter block with a valid lowercase `category` and a `heroImage`, and write root-relative `/blog/<slug>/` links.**

---

## 1. What you deliver

For each post, output one fenced `mdx` block containing:

1. The YAML frontmatter (§2).
2. The body (§3).

Also state, at the top of your handoff (outside the mdx): the **slug** you chose, and for every image a **source URL or attached file + its intended filename** (so it can be localized). Don't paste remote image URLs into the body — see §5.

---

## 2. Frontmatter (YAML) — exact schema

These fields and types are required exactly as written. Extra/unknown keys are not allowed.

```yaml
---
title: "Short, keyworded title ≤ 60 chars"
description: "One-sentence hook, 120–160 characters. Front-load the value."
publishDate: 2026-05-30 # YYYY-MM-DD, unquoted
category: ai # EXACTLY one of: laravel | ai | shopify | devops | architecture | career
tags: [kebab-case-tag, another-tag]
featured: false # true only for a standout post (rare)
draft: false # true = unpublished
heroImage:
  url: "/blog/<slug>/hero.webp" # use the slug; image gets localized later
  alt: "Descriptive alt text, no 'image of'"
---
```

| Field         | Required          | Rule                                                                                                            |
| ------------- | ----------------- | --------------------------------------------------------------------------------------------------------------- |
| `title`       | yes               | **≤ 60 characters.** Sentence case, primary keyword first, no trailing period.                                  |
| `description` | yes               | **120–160 characters.** Meta + social description. One sentence, active voice, concrete. No clickbait/ellipsis. |
| `publishDate` | yes               | `YYYY-MM-DD`, unquoted.                                                                                         |
| `category`    | yes               | Exactly one of the six values. Lowercase.                                                                       |
| `tags`        | no                | 4–8, kebab-case, lowercase. Reuse existing tags (§7).                                                           |
| `featured`    | no                | Default `false`.                                                                                                |
| `draft`       | no                | Default `false`. `true` while WIP.                                                                              |
| `heroImage`   | yes (recommended) | `{ url, alt }`. `url` = `/blog/<slug>/hero.webp`. Always include `alt`.                                         |

Optional: `updatedDate: YYYY-MM-DD` when a post is materially revised.

---

## 3. Body structure

The layout renders the `<h1>` (from `title`) and the hero (from `heroImage`). **Do not repeat them in the body.**

- ❌ Don't start the body with `# Heading` (duplicate H1 — hurts SEO + accessibility).
- ❌ Don't place the hero image as the first body line.
- ✅ Open with a 1–3 sentence hook (the pain/tension).
- ✅ Use `##` for main sections (aim for **5–9**) and `###` for sub-points. Logical order, never skip levels.
- ✅ Close with a takeaways section and a final question or CTA.
- **Length: 900–1,600 words.** Under ~600 reads thin.

Skeleton:

```mdx
Hook paragraph — name the pain in 2–3 sentences.

Second paragraph — the stakes / why it matters.

## First real section

Short paragraphs (2–4 sentences). Concrete over abstract.

![descriptive alt text](/blog/<slug>/diagram-1.webp)

## Second section

...

## Practical takeaways

1. **Bolded lead.** Explanation.
2. ...

Closing question or CTA — include an internal link (§6).
```

---

## 4. SEO rules

- **One H1 only** (auto from `title`). Sections are `##`/`###`.
- **Title** ≤ 60 chars, keyword first. **Description** 120–160 chars.
- **Internal links: 2–5 per post**, contextual, woven into prose. This is the #1 thing drafts miss.
- **External links**: write normal markdown links; they get `rel`/`target` handling automatically.
- Put the **primary keyword** in: title, description, first paragraph, and ≥1 `##`.
- No keyword stuffing. Write for senior engineers/founders; SEO follows quality.
- Use tables, ordered lists, and code blocks where they fit — they help dwell time and rich results.

---

## 5. Images (how to reference them)

You **don't** download or optimize images — but you must reference them correctly so they slot in cleanly.

- Reference every image by **root-relative local path**: `/blog/<slug>/<name>.webp`.
  - Hero → frontmatter `heroImage.url`.
  - In-body → `![alt text](/blog/<slug>/<name>.webp)`.
- Filenames: lowercase kebab-case, `.webp`, descriptive (`hero.webp`, `rag-pipeline.webp`, `vector-vs-keyword.webp`).
- **Never put a remote/CDN URL (`https://…`) in the body or frontmatter.** If you're working from remote images, use the local path in the markdown and list the source URL → filename mapping in your handoff notes so it can be localized.
- **Alt text** on every image: describe the content for screen readers + SEO. No "image of" / "picture of".
- **Count**: hero + 2–4 in-body visuals. Space them out (after roughly every 2–3 sections), don't dump them together.
- Don't add `width`/`height`/`loading` — those are added automatically.
- Don't repeat the hero in the body.

---

## 6. Internal links (targets)

Link naturally to:

- Related posts: `/blog/<slug>/` (use real existing slugs).
- Category hubs: `/blog/category/{laravel|ai|shopify|devops|architecture|career}/`
- Conversion pages: `/work/`, `/services/`, `/contact/`.

Every post should link to **≥1 related post** and **≥1 conversion page** (`/work/` or `/services/`).

---

## 7. Categories & tags

**Category — pick exactly one:**

- `laravel` — Laravel/PHP internals, Octane, Horizon, Filament, multi-tenancy.
- `ai` — LLMs, Claude, MCP, RAG, agents, embeddings, evals.
- `shopify` — Shopify Plus apps, themes, headless, checkout, agentic commerce.
- `devops` — hosting, Docker, Coolify, CI/CD, infra.
- `architecture` — system design, scaling, queues, patterns, trade-offs.
- `career` — meta / career / how-I-work.

**Tags** — 4–8, kebab-case, lowercase. Reuse existing ones before inventing new: `rag`, `ai`, `llm`, `pgvector`, `mcp`, `claude`, `agentic-ai`, `laravel`, `php`, `octane`, `queues`, `shopify`, `architecture`, `scaling`, `production`, `devops`, `docker`, `coolify`.

If the post belongs in a reading series (e.g. RAG, self-hosting/Coolify, Shopify Plus), **note that in your handoff** — don't add any series field to frontmatter (it's not in the schema).

---

## 8. Voice & style

- **Capitalization: normal sentence case.** Never write entire posts in lowercase. Capitalize proper nouns exactly: `Laravel`, `Shopify`, `Python`, `PostgreSQL`, `Redis`, `RabbitMQ`, `Docker`, `Coolify`, `Claude`, `GPT-4o`, `OpenAI`, `GitHub`, `Slack`, `Stripe`, `BigQuery`, `pgvector` (lowercase package name), `scikit-learn`, `XGBoost`, `RAG`, `MCP`, `LLM`/`LLMs`, `API`, `JSON`, `SaaS`, `PDF`/`PDFs`.
- **Voice**: senior engineer talking to senior engineers and founders. Direct, opinionated, concrete. Second person ("you"); first person for lived experience ("I've shipped…"). Contractions are fine.
- **No fluff / no AI tells**: avoid "In today's fast-paced world", "Let's dive in", "It's important to note", "In conclusion", "Furthermore/Moreover" pile-ups, em-dash overuse, hype adjectives. Prefer specifics (tools, trade-offs, numbers) over generalities.
- **Paragraphs** short (2–4 sentences). **Lists** for steps/criteria, **bold** the lead of each item. **Tables** for comparisons.
- **Code blocks**: always fenced with a language (` ```php `, ` ```ts `, ` ```bash `, ` ```sql `). Keep examples real and minimal; comments in sentence case.
- **No fabricated claims**: no invented metrics, fake client names, or made-up benchmarks. Qualitative is fine ("latency dropped materially"); fake numbers are not.
- Standard Markdown only — no raw HTML.

---

## 9. ⛔ Hard "never" list

1. **Never** leave stray tags/markup at the end (e.g. `</content>`, tool output). End on prose — a stray tag breaks the post.
2. **Never** put a remote image URL in the content — use the local `/blog/<slug>/…` path (§5).
3. **Never** start the body with `#` (duplicate H1) or with the hero image.
4. **Never** use a `category` outside the six allowed values.
5. **Never** add frontmatter keys not in §2.
6. **Never** use a date format other than `YYYY-MM-DD`.
7. **Never** ship lowercase-everything prose or skip proper-noun capitalization.

---

## 10. Pre-delivery checklist

- [ ] Title ≤ 60 chars; description 120–160 chars.
- [ ] Valid `category` (one of six); kebab-case tags (4–8); `publishDate` set as `YYYY-MM-DD`.
- [ ] Body does **not** start with `#` or the hero image.
- [ ] 5–9 `##` sections, logical order; ends with takeaways + closing CTA/question.
- [ ] 900–1,600 words.
- [ ] 2–5 internal links (≥1 related post, ≥1 conversion page).
- [ ] Hero + 2–4 in-body images, **local paths** `/blog/<slug>/…`, descriptive alt; source URLs listed in handoff.
- [ ] Proper-noun capitalization correct; no lowercase-everything.
- [ ] Code blocks fenced with a language.
- [ ] No stray markup at the end.

---

## Reference shape

Match the frontmatter, structure, internal links, and voice of `ml-vs-genai.mdx` and `7-rag-mistakes-production.mdx`.
