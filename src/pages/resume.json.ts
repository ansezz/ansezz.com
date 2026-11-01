import type { APIRoute } from "astro";
import { SITE, OWNER, SOCIALS, LANGUAGES, AVAILABLE_FOR } from "@/consts";

// JSON Resume (https://jsonresume.org/schema). Machine-readable résumé that
// complements the PDF and llms.txt. Derived from site config — no duplication.

const LEVEL: Record<string, string> = {
  Native: "Native speaker",
  Professional: "Full professional proficiency",
  Basic: "Elementary proficiency",
};

const profileNetwork: Record<string, string> = {
  GitHub: "GitHub",
  LinkedIn: "LinkedIn",
  Upwork: "Upwork",
  X: "X",
};

export const GET: APIRoute = async () => {
  const resume = {
    $schema:
      "https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json",
    basics: {
      name: OWNER.NAME,
      label: OWNER.ROLES.join(" · "),
      email: SITE.EMAIL,
      phone: SITE.PHONE,
      url: SITE.URL,
      summary: SITE.DESCRIPTION,
      location: {
        city: SITE.CITY,
        countryCode: SITE.COUNTRY_CODE,
        region: SITE.COUNTRY,
      },
      profiles: SOCIALS.filter((s) => s.NAME in profileNetwork).map((s) => ({
        network: profileNetwork[s.NAME],
        url: s.HREF,
      })),
    },
    skills: [
      {
        name: "Backend",
        keywords: [
          "Laravel",
          "PHP",
          "Octane",
          "Horizon",
          "Filament",
          "PostgreSQL",
          "Redis",
          "RabbitMQ",
        ],
      },
      {
        name: "AI engineering",
        keywords: [
          "Anthropic Claude",
          "Claude API",
          "MCP",
          "RAG",
          "pgvector",
          "Agentic AI",
          "Evals",
        ],
      },
      {
        name: "Shopify",
        keywords: [
          "Shopify Plus",
          "App Bridge",
          "GraphQL Admin API",
          "Shopify Functions",
          "Liquid",
        ],
      },
      {
        name: "Architecture",
        keywords: [
          "Clean Architecture",
          "DDD",
          "TDD",
          "Multi-tenant SaaS",
          "Event sourcing",
          "Docker",
          "Coolify",
        ],
      },
    ],
    languages: LANGUAGES.map((l) => ({
      language: l.label,
      fluency: LEVEL[l.level] ?? l.level,
    })),
    meta: {
      canonical: `${SITE.URL}/resume.json`,
      version: "1.0.0",
      availableFor: AVAILABLE_FOR,
      remoteSince: OWNER.REMOTE_SINCE,
      yearsExperience: OWNER.YEARS_EXPERIENCE,
    },
  };

  return new Response(JSON.stringify(resume, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
