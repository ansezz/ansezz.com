// Article house-style components. The blog post page passes this map to
// <Content components={mdxComponents} />, so posts can use these tags
// without importing them. See ARTICLE-STYLE.md for usage rules.
import Summary from "./Summary.astro";
import TryThis from "./TryThis.astro";
import BeforeAfter from "./BeforeAfter.astro";
import PullQuote from "./PullQuote.astro";
import Takeaway from "./Takeaway.astro";
import Callout from "./Callout.astro";
import Figure from "./Figure.astro";

export const mdxComponents = {
  Summary,
  TryThis,
  BeforeAfter,
  PullQuote,
  Takeaway,
  Callout,
  Figure,
};

export { Summary, TryThis, BeforeAfter, PullQuote, Takeaway, Callout, Figure };
