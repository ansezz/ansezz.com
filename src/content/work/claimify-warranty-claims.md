---
title: "Claimify — warranty + returns claims for Shopify"
description: "Warranty, damage, and return claims managed inside Shopify Admin — customers file from the storefront, merchants triage, approve, and refund from one queue."
category: shopify
stack:
  - "Laravel"
  - "Remix"
  - "Shopify GraphQL Admin API"
  - "App Bridge"
  - "Polaris"
  - "Webhooks"
  - "S3 / R2 (uploads)"
outcome: "Centralized claims pipeline; merchant time-per-claim down materially"
liveUrl: "https://apps.shopify.com/claimify"
order: 2
featured: true
---

## The problem

Warranty and damage claims are where good stores lose hours and goodwill. Most merchants run them out of a shared inbox: a customer emails a blurry photo, support digs through orders to confirm the purchase, threads sprawl, and nobody can say what state a claim is in. It doesn't scale, and it's invisible to the rest of the team.

Claimify replaces that inbox with a real pipeline — embedded right inside Shopify Admin so merchants never leave the tool they already live in.

## What I built

- A **storefront claim form** customers reach from their order or a help page. They pick the item, the claim type (warranty / damage / return), describe the issue, and attach photos.
- An **embedded admin queue** built with App Bridge + Polaris, so it looks and behaves like native Shopify. Every claim has a status, an owner, and a full history.
- **One-click resolution** — approve and trigger a refund or a reship without copy-pasting order data between tabs.
- **Status webhooks** so the merchant's other systems (helpdesk, analytics) stay in sync as a claim moves through the pipeline.

## How it works

The app is a Laravel backend with a Remix embedded frontend. Customer-uploaded evidence goes straight to object storage (S3 / R2) with signed URLs, keeping large image payloads off the app servers. Order and product context is pulled live from the **Shopify GraphQL Admin API**, so a claim always reflects the real order rather than a stale copy.

Claim state is modeled explicitly — every transition (submitted → under review → approved / declined → resolved) is an event, which makes the history auditable and the webhooks trivial to emit. Protected customer data is handled per Shopify's requirements.

## The result

Claims stopped living in an inbox and started living in a queue with owners, states, and an audit trail. Merchants triage and resolve from a single screen, and time-per-claim dropped materially because the order context and the resolution actions are in the same place.
