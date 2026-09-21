---
title: "Production RAG on Postgres + pgvector"
description: "Hybrid RAG on Postgres: BM25 + pgvector + RRF, Cohere rerank, CI eval harness, and cost guardrails. No managed vector database required."
category: ai
stack:
  - "Laravel"
  - "PostgreSQL"
  - "pgvector"
  - "OpenAI Embeddings"
  - "Cohere Rerank"
  - "Anthropic Claude"
  - "Eval harness (Pest)"
outcome: "Answer accuracy passed eval bar; vector infra cost cut vs managed DB"
order: 1
featured: true
---

## Problem

The demo worked. That is the trap.

A semantic-search prototype answers the five questions you thought to ask, so it ships. Then real users arrive with acronyms, product codes, and exact error strings, and pure vector search quietly returns things that are about the right topic instead of the thing they asked for. Nothing errors. Answers are just subtly wrong, and trust drains over a few weeks.

The default architecture also adds a managed vector database next to primary Postgres: a second datastore to sync, secure, back up, pay for, and reconcile when the two disagree about what exists.

## Constraints

- Keep vectors in the same PostgreSQL database as the product data. One source of truth.
- Lexical and vector indexes must not drift: write both in one transaction.
- Retrieval must handle exact SKUs and error strings, not only paraphrases.
- Accuracy has to be measurable in CI, not judged by vibes after deploy.
- Vendor outages and token spend need guardrails (cache, budgets, degrade path).

## What shipped

- **Hybrid retrieval**: Postgres full-text (BM25-style) and pgvector cosine as two candidate sets, merged with Reciprocal Rank Fusion.
- **Cohere reranker** as a separate stage: retrieve ~50 for recall, reorder for precision, send only the top handful to the model.
- **Eval harness in CI** (Pest): fixed questions with known-good answers, scored on retrieval hit-rate and answer faithfulness.
- **Cost and latency guardrails**: per-tenant token budgets, semantic cache, circuit breaker that degrades to lexical-only on embedding outage.
- Heading-aware chunking, queued embedding jobs, embedding model version pinned per chunk.

Longer write-up: [why your RAG is failing](/blog/why-your-rag-is-failing/) and the [RAG in Production](/blog/series/rag-in-production/) series. Problem page: [production RAG on Laravel](/production-rag-laravel/).

## Result

Answer quality cleared the eval bar and stayed there, because regressions fail the build before deploy. Keeping vectors inside Postgres removed a managed vector service from the bill and the ops surface: one database to back up, one to secure, one source of truth. Outcomes are eval-bar pass and infra simplification, not invented latency percentiles or dollar amounts.

## Stack

Laravel, PostgreSQL, pgvector, OpenAI Embeddings, Cohere Rerank, Anthropic Claude, Pest eval harness.

## Want production RAG on Laravel?

If you need hybrid search, reranking, and evals without a second vector database, see [AI & MCP Integration](/services/ai-mcp/), [production RAG on Laravel](/production-rag-laravel/), or [start an AI sprint](/contact/?package=ai).
