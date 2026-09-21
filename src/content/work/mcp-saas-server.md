---
title: "MCP Server for a Multi-tenant Laravel SaaS"
description: "MCP server on a Laravel SaaS exposing tickets, billing, and docs as tools. Tenant-scoped auth, audit logs, pgvector retrieval for tier-1 support."
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

## Problem

Support tickets were eating senior engineer time. The answers already lived in the product (billing state, ticket history, docs), but Claude could not see any of it. Every tier-1 "where is my invoice / reset my seat" bounced to a human who knew the answer was one query away.

The buyer pain is clear: agents that can act inside a multi-tenant SaaS without inventing a parallel API or leaking tenants.

## Constraints

- Agents only see the tenant they act for. No cross-tenant leakage.
- Tools must call the same domain services the web UI already trusts, not a shadow API.
- Every tool call needs an audit log: who asked, what was fetched, what was mutated.
- Doc answers need retrieval over internal content, not free-form hallucination.
- Stay inside the existing Laravel permission and tenancy model.

## What shipped

- An **MCP server** on the Laravel SaaS exposing tickets, billing, and docs as MCP resources and tools Claude can call.
- **Tool-scoped auth** so an agent is locked to one tenant.
- **Audit logging** on every tool call.
- Retrieval over internal docs via **pgvector** so "how do I…" questions land on the right page.
- Prism PHP wrapping the Anthropic Claude API; MCP as the integration surface agents discover and call.

More on this pattern: [MCP for Laravel SaaS](/mcp-for-laravel-saas/) and [AI & MCP services](/services/ai-mcp/).

## Result

Tier-1 resolution moved in-app. Seniors stopped living in the ticket queue for the boring half of the backlog, and every agent action left an audit trail someone can actually read. No invented resolution-rate percentages: the measured win is who no longer has to handle those tickets by hand.

## Stack

Laravel, Anthropic Claude API, Model Context Protocol, Prism PHP, PostgreSQL, pgvector.

## Want MCP on your Laravel SaaS?

If you need multi-tenant-safe MCP with auth, audit logs, and evals, see [AI & MCP Integration](/services/ai-mcp/), [MCP for Laravel SaaS](/mcp-for-laravel-saas/), or [start an AI sprint](/contact/?package=ai).
