---
title: "YouCan — multi-tenant commerce platform"
description: "Multi-tenant commerce platform for MENA and West Africa: one Laravel codebase running tenant-scoped storefronts, theming, local payments, analytics."
category: saas
stack:
  - "Laravel"
  - "Vue.js"
  - "PostgreSQL"
  - "Redis"
  - "RabbitMQ"
  - "Stripe / local PSPs"
  - "Multi-tenancy"
liveUrl: "https://youcan.shop/en"
outcome: "Built core merchant tooling for a regional Shopify-like platform"
order: 3
featured: true
---

## The problem

Building a Shopify-like platform for MENA and West Africa means solving the same problems Shopify did — storefronts, theming, payments, shipping, analytics — but for a region with its own payment rails, languages, and logistics, and at a price point that works for thousands of small merchants on one codebase.

The hard constraint is multi-tenancy: every merchant needs an isolated store, but they all run on shared infrastructure that has to stay fast and cheap as the merchant count grows.

## What I worked on

Core merchant tooling on a single Laravel codebase serving tenant-scoped storefronts:

- **Tenant isolation** — every store's data scoped and separated so one merchant can never see or touch another's, without spinning up a database per tenant.
- **Theming engine** — merchants customize their storefront from a shared set of themes, rendered per tenant.
- **Payments** — integrating Stripe alongside local payment service providers, because regional checkout is where generic platforms fall down.
- **Dashboard + analytics** — the back office merchants use daily to run their store.

## How it's built

Laravel + PostgreSQL for the core, with **Redis** for caching and sessions and **RabbitMQ** for asynchronous work — order processing, notifications, and analytics roll-ups run off the request path so the storefront and dashboard stay responsive under load. A Vue.js frontend powers the merchant dashboard.

The recurring theme across the work is keeping per-tenant logic clean on shared infrastructure: tenant scoping enforced at the data layer, heavy work pushed to queues, and caching tuned so thousands of stores share the same servers without stepping on each other.

## The result

A regional, hosted commerce platform with the merchant tooling — storefronts, theming, payments, analytics — that small businesses across MENA and West Africa actually run their stores on.
