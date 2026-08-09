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
order: 4
featured: false
---
