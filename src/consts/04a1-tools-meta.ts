import type { BlogTag } from "./02b-blog-tags-types";

// ── Free tools ────────────────────────────────────────────
export const TOOLS = {
  TITLE: "Tools",
  DESCRIPTION:
    "Free, no-signup engineering tools that run entirely in your browser — LLM token and cost math, encoding, hashing, JSON tooling, infra sizing, Shopify helpers.",
};

export type ToolGroupId =
  | "ai"
  | "encoding"
  | "data"
  | "infra"
  | "shopify"
  | "reference";

export interface ToolGroup {
  id: ToolGroupId;
  label: string;
  blurb: string;
}

/** Section order on /tools/. Groups render in this order. */
export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: "ai",
    label: "AI & LLM",
    blurb:
      "Budget a prompt before it bankrupts you: token math, context windows, chunking, and API spend.",
  },
  {
    id: "encoding",
    label: "Encoding & secrets",
    blurb:
      "Encode, decode, hash, and generate. Every one of these runs client-side — nothing is transmitted.",
  },
  {
    id: "data",
    label: "Data & APIs",
    blurb:
      "JSON, URLs, and schemas. The tools you reach for mid-debug with a payload in your clipboard.",
  },
  {
    id: "infra",
    label: "Infrastructure",
    blurb:
      "Cron, timestamps, permissions, bandwidth, latency, capacity. The arithmetic nobody wants to redo by hand.",
  },
  {
    id: "shopify",
    label: "Shopify",
    blurb:
      "Built while shipping Shopify apps — webhook verification and the ID formats that keep changing.",
  },
  {
    id: "reference",
    label: "Reference",
    blurb:
      "Lookup tables I got tired of searching for. Status codes, headers, ports — filterable, no ads.",
  },
];

export interface ToolEntry {
  title: string;
  blurb: string;
  href: string;
  icon: string;
  tone: "yellow" | "pink" | "cyan" | "green" | "purple";
  status: "live" | "soon";
  group: ToolGroupId;
  /** Join key to the blog. Posts surface tools sharing at least one tag. */
  tags: BlogTag[];
}
