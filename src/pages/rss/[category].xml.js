import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { SITE, BLOG_CATEGORIES, CATEGORY_LABEL } from "@/consts";

// NOTE: rendered with markdown-it, not the MDX compiler — faithful for the
// current plain-Markdown posts; MDX components would not render here.
const parser = new MarkdownIt({ html: true, linkify: true });

function absolutize(html, siteUrl) {
  const base = siteUrl.replace(/\/$/, "");
  return html
    .replace(/(src|href)="\/(?!\/)/g, `$1="${base}/`)
    .replace(/(src|href)='\/(?!\/)/g, `$1='${base}/`);
}

export async function getStaticPaths() {
  return BLOG_CATEGORIES.map((category) => ({ params: { category } }));
}

export async function GET(context) {
  const category = context.params.category;
  const site = context.site?.toString() ?? SITE.URL;
  const posts = (
    await getCollection(
      "blog",
      ({ data }) => !data.draft && data.category === category,
    )
  ).sort((a, b) => b.data.publishDate.getTime() - a.data.publishDate.getTime());

  return rss({
    title: `${SITE.TITLE} | ${CATEGORY_LABEL[category] ?? category}`,
    description: `${CATEGORY_LABEL[category] ?? category} posts from ${SITE.TITLE}.`,
    site: context.site,
    items: posts.map((post) => {
      const safe = sanitizeHtml(
        absolutize(parser.render(post.body ?? ""), site),
        {
          allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
          allowedAttributes: {
            ...sanitizeHtml.defaults.allowedAttributes,
            img: ["src", "alt", "title", "width", "height"],
          },
        },
      );
      return {
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.updatedDate ?? post.data.publishDate,
        link: `/blog/${post.id}/`,
        categories: [post.data.category, ...post.data.tags],
        content: safe,
      };
    }),
  });
}
