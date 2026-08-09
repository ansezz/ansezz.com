---
title: "Maestro Theme Scheduler — Shopify theme deployment"
description: "Public Shopify app that schedules theme publishes for drops, sales, and seasonal launches. Merchants queue a future rollout with rollback and it fires on time."
category: shopify
stack:
  - "Laravel"
  - "Remix"
  - "Shopify GraphQL Admin API"
  - "Theme Assets API"
  - "App Bridge"
  - "Polaris"
  - "Webhooks"
  - "Cron / Queues"
outcome: "Zero-downtime theme swaps; no engineer needed for midnight drops"
liveUrl: "https://apps.shopify.com/maestro-theme-scheduler"
order: 1
featured: true
---

## The problem

Big drops happen at inconvenient times. A sale goes live at midnight, a collaboration launches at 9am sharp, a seasonal theme needs to flip the instant a campaign starts. The default Shopify answer is "have someone publish the theme manually at that exact minute" — which means an engineer or marketer babysitting a dashboard at 11:59pm, and a scramble if anything goes wrong.

Maestro Theme Scheduler turns that ritual into a scheduled job: queue the theme, pick the moment, walk away.

## What I built

- A **scheduler** where merchants pick a theme and a publish time. The swap happens automatically at the planned minute.
- **One-click rollback** — schedule the revert too, or roll back instantly if a launch goes sideways.
- A **preview + safety check** before anything goes live, so the queued theme is the one merchants think it is.
- An **embedded Admin UI** (App Bridge + Polaris) that feels native to Shopify.

## How it works

A Laravel backend owns the schedule and the queue; a Remix frontend runs embedded in Admin. When a scheduled publish comes due, a queued job calls the **Shopify GraphQL Admin API** to flip the live theme — the swap is atomic from the storefront's perspective, so shoppers never see a half-deployed store.

The risky part of any scheduler is reliability: the job _must_ fire at the right minute and _must not_ fire twice. Publishes run through durable queues with idempotent handlers, so a retry can't double-publish, and a missed tick is caught and reconciled rather than silently dropped. Theme assets are handled via the Theme Assets API so a queued rollout is validated, not just referenced by ID.

## The result

Midnight drops and timed launches stopped needing a human on call. Merchants schedule the swap (and its rollback) ahead of time and trust it to fire — zero-downtime theme changes without an engineer awake to press the button.
