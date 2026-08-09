---
title: "Production RAG pipeline on PostgreSQL + pgvector"
description: "End-to-end RAG pipeline on Postgres: hybrid search (BM25 + vector + RRF), a Cohere reranker, an eval harness, and cost guardrails. No managed vector DB."
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

## The problem

The demo worked. That's the trap.

A semantic-search prototype answers the five questions you thought to ask, so it ships. Then real users arrive with acronyms, product codes, and exact error strings — and pure vector search quietly returns things that are _about_ the right topic instead of the thing they actually asked for. Nobody files a bug, because nothing errors. The answers are just subtly wrong, and trust drains out over a few weeks.

On top of that, the default architecture everyone reaches for adds a managed vector database next to the primary Postgres. That's a second datastore to sync, secure, back up, pay for, and reconcile when the two disagree about what exists.

## What I built

- **Hybrid retrieval, not vector-only.** Postgres full-text (BM25-style lexical ranking) and pgvector cosine similarity run as two independent candidate sets, then merge with **Reciprocal Rank Fusion**. Lexical catches the exact SKU and the literal error message; vectors catch the paraphrase. Neither alone was good enough.
- **A reranker as a separate stage.** Retrieval optimises recall — pull ~50 candidates. A Cohere cross-encoder then reorders them for precision, and only the top handful reach the model. Reranking was the single largest accuracy jump in the whole pipeline.
- **An eval harness that runs in CI.** A fixed question set with known-good answers, scored on retrieval hit-rate and answer faithfulness, running as Pest tests. A prompt tweak that improves one question and breaks four now fails the build instead of shipping.
- **Cost and latency guardrails.** Per-tenant token budgets, a semantic cache in front of the LLM call, and a circuit breaker around the embedding provider so a vendor outage degrades to lexical-only search instead of a 500.

## How it works

Everything lives in one PostgreSQL database. Documents are chunked with heading-aware splitting (chunk boundaries follow the document's own structure rather than an arbitrary character count), embedded through a queued Laravel job, and stored alongside a `tsvector` column in the same row. One transaction writes both representations, so the lexical and vector indexes can never drift apart.

Query time is three stages: fan out to both indexes, fuse with RRF, rerank the fused set, then assemble the prompt from the survivors with citations attached. The whole path is instrumented — retrieval latency, rerank latency, token spend, and cache hit rate are separate metrics, because "RAG is slow" is not an actionable statement.

Embedding model version is stored per chunk. Vectors from different model versions aren't comparable, so mixing them produces similarity scores that look plausible and rank randomly. Pinning the version makes a re-index an explicit, auditable migration.

## The result

Answer quality cleared the eval bar and stayed there, because the harness makes regressions visible before deploy rather than after. Keeping vectors inside Postgres removed an entire managed service from the bill and the ops surface — one database to back up, one to secure, one source of truth about what exists.

The wider write-up of what breaks and why is in the [RAG in Production](/blog/series/rag-in-production/) series, starting with [why your RAG is failing](/blog/why-your-rag-is-failing/).
