/** Known AI crawlers, training bots, and aggressive scrapers (case-insensitive). */
export const BLOCKED_BOT_PATTERNS = [
  // AI assistants & training crawlers
  "claudebot",
  "claude-web",
  "claude-user",
  "anthropic-ai",
  "gptbot",
  "chatgpt-user",
  "oai-searchbot",
  "google-extended",
  "googlebot",
  "bingbot",
  "perplexitybot",
  "bytespider",
  "ccbot",
  "cohere-ai",
  "diffbot",
  "youbot",
  "applebot-extended",
  "meta-externalagent",
  "facebookbot",
  "imagesiftbot",
  "omgilibot",
  "timpibot",
  "seekrbot",
  "img2dataset",
  "icc-crawler",
  "amazonbot",
  "petalbot",
  // SEO / bulk scrapers
  "semrushbot",
  "ahrefsbot",
  "mj12bot",
  "dotbot",
  "baiduspider",
  "yandexbot",
  "rogerbot",
  "screaming frog",
  // Headless automation often used for scraping
  "headlesschrome",
  "puppeteer",
  "playwright",
  "phantomjs",
  "selenium",
  "scrapy",
  "wget",
  "httrack",
  "nutch",
] as const;

export function isBlockedBotUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BLOCKED_BOT_PATTERNS.some((pattern) => ua.includes(pattern));
}

export const ROBOTS_DIRECTIVES =
  "noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate";
