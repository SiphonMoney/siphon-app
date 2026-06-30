/**
 * Anti-scraping / anti-AI-crawler controls for Siphon.
 * Shared by middleware, next.config headers, and robots.txt generation.
 */

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
  "googleother",
  "googlebot",
  "google-inspectiontool",
  "bingbot",
  "bingpreview",
  "perplexitybot",
  "bytespider",
  "ccbot",
  "cohere-ai",
  "diffbot",
  "youbot",
  "applebot-extended",
  "applebot",
  "meta-externalagent",
  "meta-externalfetcher",
  "facebookbot",
  "imagesiftbot",
  "omgilibot",
  "timpibot",
  "seekrbot",
  "img2dataset",
  "icc-crawler",
  "amazonbot",
  "petalbot",
  "mistralai",
  "mistralbot",
  "ai2bot",
  "duckassistbot",
  "grokbot",
  "xai-bot",
  "firecrawl",
  "brightbot",
  "anchor browser",
  "anchorbrowser",
  "webzio",
  "friendlycrawler",
  "dataforseobot",
  "magpie-crawler",
  "cohere-training-data-crawler",
  // SEO / bulk scrapers
  "semrushbot",
  "ahrefsbot",
  "mj12bot",
  "dotbot",
  "baiduspider",
  "yandexbot",
  "rogerbot",
  "screaming frog",
  "blexbot",
  "barkrowler",
  // Headless automation often used for scraping
  "headlesschrome",
  "headless",
  "puppeteer",
  "playwright",
  "phantomjs",
  "selenium",
  "scrapy",
  "wget",
  "curl/",
  "python-requests",
  "python-urllib",
  "go-http-client",
  "java/",
  "libwww-perl",
  "httrack",
  "nutch",
  "axios/",
  "node-fetch",
  "undici",
] as const;

/** User-agent tokens for robots.txt (canonical casing where known). */
export const ROBOTS_DISALLOW_AGENTS = [
  "*",
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "Claude-User",
  "anthropic-ai",
  "Google-Extended",
  "GoogleOther",
  "Googlebot",
  "Bingbot",
  "PerplexityBot",
  "Bytespider",
  "CCBot",
  "cohere-ai",
  "Diffbot",
  "Applebot-Extended",
  "meta-externalagent",
  "Meta-ExternalFetcher",
  "FacebookBot",
  "Amazonbot",
  "PetalBot",
  "MistralAI-User",
  "AI2Bot",
  "DuckAssistBot",
  "FirecrawlAgent",
  "ImagesiftBot",
  "Omgilibot",
  "YouBot",
  "SeekrBot",
  "Timpibot",
] as const;

/** Load balancers / orchestrators — do not treat as scrapers. */
const ALLOWED_INFRA_USER_AGENTS = [
  "elb-healthchecker",
  "kube-probe",
  "googlehc",
  "uptimerobot",
  "pingdom",
] as const;

/** Domains in From headers used by AI fetchers. */
const BLOCKED_FETCHER_FROM_PATTERNS = [
  "openai.com",
  "anthropic.com",
  "perplexity.ai",
  "cohere.com",
  "mistral.ai",
  "bytedance.com",
] as const;

/**
 * Crawler directives including newer noai/noimageai hints where supported.
 * @see https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
 */
export const ROBOTS_DIRECTIVES =
  "noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate, noai, noimageai";

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "X-Robots-Tag": ROBOTS_DIRECTIVES,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()",
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  "Pragma": "no-cache",
};

export function securityHeaderEntries(): { key: string; value: string }[] {
  return Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value }));
}

export function applySecurityHeaders(headers: Headers): void {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }
}

function isAllowedInfraUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return ALLOWED_INFRA_USER_AGENTS.some((pattern) => ua.includes(pattern));
}

export function isBlockedBotUserAgent(userAgent: string | null): boolean {
  if (!userAgent || isAllowedInfraUserAgent(userAgent)) return false;
  const ua = userAgent.toLowerCase();
  return BLOCKED_BOT_PATTERNS.some((pattern) => ua.includes(pattern));
}

function headerContainsBlockedFetcher(value: string | null): boolean {
  if (!value) return false;
  const lower = value.toLowerCase();
  return BLOCKED_FETCHER_FROM_PATTERNS.some((domain) => lower.includes(domain));
}

/** AI link-preview and similar non-browser fetch modes. */
function hasAiPreviewHeaders(headers: Headers): boolean {
  const purpose = headers.get("x-purpose") ?? headers.get("purpose");
  if (purpose?.toLowerCase().includes("preview")) return true;

  const from = headers.get("from");
  if (headerContainsBlockedFetcher(from)) return true;

  const forwarded = headers.get("x-forwarded-for");
  if (headerContainsBlockedFetcher(forwarded)) return false;

  return false;
}

function isHtmlNavigationRequest(headers: Headers): boolean {
  const accept = headers.get("accept") ?? "";
  const secFetchDest = headers.get("sec-fetch-dest");
  const secFetchMode = headers.get("sec-fetch-mode");

  if (secFetchDest === "document" || secFetchMode === "navigate") return true;
  return accept.includes("text/html");
}

function isBareOrScriptUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return true;
  const ua = userAgent.trim();
  if (ua.length < 12) return true;
  return false;
}

export type CrawlerBlockReason =
  | "blocked-user-agent"
  | "ai-preview"
  | "missing-user-agent";

export function getCrawlerBlockReason(
  userAgent: string | null,
  headers: Headers,
  pathname: string,
): CrawlerBlockReason | null {
  if (isBlockedBotUserAgent(userAgent)) return "blocked-user-agent";
  if (hasAiPreviewHeaders(headers)) return "ai-preview";

  if (isAllowedInfraUserAgent(userAgent)) return null;

  const isApi = pathname.startsWith("/api/");
  if (!isApi && isHtmlNavigationRequest(headers) && isBareOrScriptUserAgent(userAgent)) {
    return "missing-user-agent";
  }

  return null;
}

export function isBlockedCrawlerRequest(
  userAgent: string | null,
  headers: Headers,
  pathname: string,
): boolean {
  return getCrawlerBlockReason(userAgent, headers, pathname) !== null;
}
