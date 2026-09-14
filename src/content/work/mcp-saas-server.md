---
title: "MCP server for an internal SaaS"
description: "An MCP server exposing a Laravel SaaS's tickets, billing, and docs as resources and tools, so Claude agents resolve tier-1 support in-app, with audit logging."
category: ai
stack:
  - "Laravel"
  - "Anthropic Claude API"
  - "Model Context Protocol"
  - "Prism PHP"
  - "PostgreSQL"
  - "pgvector"
outcome: "Tier-1 ticket auto-resolution; senior engineers off the ticket queue"
order: 31
featured: true
---

## The problem

Support tickets were eating senior engineer time. The answers lived in the product — billing state, ticket history, docs — but Claude couldn't see any of it. Every tier-1 "where's my invoice / reset my seat" bounced to a human who already knew the answer was one query away.

## What I built

- An **MCP server** sitting on the Laravel SaaS, exposing tickets, billing, and docs as MCP resources and tools Claude can call.
- **Tool-scoped auth** so an agent only sees the tenant it is acting for — no cross-tenant leakage.
- **Audit logging** on every tool call: who asked, what was fetched, what was mutated.
- Retrieval over internal docs via **pgvector**, so "how do I…" questions land on the right page instead of a hallucinated answer.

## How it works

Prism PHP wraps the Anthropic Claude API. The MCP layer is the integration surface — agents discover tools, call them, and stay inside the same tenancy and permission model the web UI uses. Nothing invents a parallel API; the tools call the same domain services the app already trusts.

## The result

Tier-1 resolution moved in-app. Seniors stopped living in the ticket queue for the boring half of the backlog, and every agent action left an audit trail someone can actually read.
