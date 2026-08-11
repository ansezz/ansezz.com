import { SITE } from "@/consts";

interface BreadcrumbEntry {
  name: string;
  url?: string;
}

export function breadcrumbList(entries: BreadcrumbEntry[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: entries.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: e.name,
      ...(e.url
        ? {
            item: e.url.startsWith("http")
              ? e.url
              : new URL(e.url, SITE.URL).href,
          }
        : {}),
    })),
  };
}

interface WebPageOpts {
  url: string;
  title: string;
  description: string;
  image?: string;
  datePublished?: string;
  dateModified?: string;
}

export function webPage({
  url,
  title,
  description,
  image,
  datePublished,
  dateModified,
}: WebPageOpts) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: title,
    description,
    inLanguage: "en",
    isPartOf: { "@id": `${SITE.URL}#website` },
    author: { "@id": `${SITE.URL}#person` },
    publisher: { "@id": `${SITE.URL}#person` },
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
    ...(image
      ? {
          primaryImageOfPage: {
            "@type": "ImageObject",
            url: image.startsWith("http")
              ? image
              : new URL(image, SITE.URL).href,
          },
        }
      : {}),
  };
}

interface CollectionItem {
  url: string;
  name: string;
  description?: string;
  datePublished?: string;
}

export function collectionPage(opts: {
  url: string;
  title: string;
  description: string;
  items: CollectionItem[];
  itemType?: "BlogPosting" | "CreativeWork" | "WebPage";
}) {
  const { url, title, description, items, itemType = "WebPage" } = opts;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#webpage`,
    url,
    name: title,
    description,
    inLanguage: "en",
    isPartOf: { "@id": `${SITE.URL}#website` },
    author: { "@id": `${SITE.URL}#person` },
    publisher: { "@id": `${SITE.URL}#person` },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: item.url.startsWith("http")
          ? item.url
          : new URL(item.url, SITE.URL).href,
        item: {
          "@type": itemType,
          url: item.url.startsWith("http")
            ? item.url
            : new URL(item.url, SITE.URL).href,
          name: item.name,
          ...(item.description ? { description: item.description } : {}),
          ...(item.datePublished ? { datePublished: item.datePublished } : {}),
        },
      })),
    },
  };
}

interface FaqItem {
  question: string;
  answer: string;
}

export function faqPage(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

interface HowToStep {
  name: string;
  text: string;
}

export function howTo(opts: {
  name: string;
  description: string;
  url: string;
  steps: HowToStep[];
}) {
  const { name, description, url, steps } = opts;
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "@id": `${url}#howto`,
    name,
    description,
    step: steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}
