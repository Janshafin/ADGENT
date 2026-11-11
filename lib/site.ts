/**
 * The public origin of this deployment, for canonical URLs, the sitemap and social cards.
 * APP_URL wins; on Render, RENDER_EXTERNAL_URL is set automatically.
 */
export const SITE_URL = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/+$/, "");

export const SITE_NAME = "ADGENT";
export const SITE_TAGLINE = "Ads for the age of AI shopping";
export const SITE_DESCRIPTION =
  "Pay-per-sale ads shown inside AI shopping assistants and settled end to end on PayPal. Merchants pay only when a sale settles; publishers earn a share of every sale.";

/** Pages worth indexing, with how often they change. */
export const PUBLIC_PAGES = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/judges", priority: 0.9, changeFrequency: "weekly" },
  { path: "/merchant", priority: 0.8, changeFrequency: "weekly" },
  { path: "/agent", priority: 0.8, changeFrequency: "weekly" },
  { path: "/control", priority: 0.7, changeFrequency: "daily" },
  { path: "/publisher", priority: 0.7, changeFrequency: "weekly" },
  { path: "/demo/blog", priority: 0.4, changeFrequency: "monthly" },
] as const;
