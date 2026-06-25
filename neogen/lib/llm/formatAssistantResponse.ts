export type AssistantListItem = {
  title?: string;
  body: string;
};

export type AssistantBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: AssistantListItem[] };

export type FormattedAssistantResponse = {
  blocks: AssistantBlock[];
  sources: string[];
};

const INLINE_SOURCE_RE = /\[source:\s*([^\]]+)\]/gi;
const BULLET_RE = /^\s*[*-]\s+(.+)$/;
const BOLD_TITLE_OUTSIDE_COLON_RE = /^\*\*(.+?)\*\*:\s*(.*)$/;
const BOLD_TITLE_INSIDE_COLON_RE = /^\*\*(.+?):\*\*\s*(.*)$/;

function normalizeSourceLabel(source: string) {
  return source.trim();
}

function splitParagraphs(text: string) {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function parseListItem(raw: string): AssistantListItem {
  const match =
    raw.match(BOLD_TITLE_OUTSIDE_COLON_RE) ??
    raw.match(BOLD_TITLE_INSIDE_COLON_RE);
  if (!match) return { body: raw.trim() };
  return {
    title: match[1].trim(),
    body: match[2].trim(),
  };
}

function parseParagraph(paragraph: string): AssistantBlock {
  const lines = paragraph.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { type: "paragraph", text: "" };
  const allBullets = lines.every((line) => BULLET_RE.test(line));
  if (!allBullets) {
    return { type: "paragraph", text: paragraph.trim() };
  }
  const items = lines
    .map((line) => line.match(BULLET_RE))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => parseListItem(m[1] ?? ""));
  return { type: "list", items };
}

export function formatAssistantResponse(rawText: string): FormattedAssistantResponse {
  const foundSources: string[] = [];
  const textWithoutSources = rawText.replace(INLINE_SOURCE_RE, (_, source: string) => {
    const s = normalizeSourceLabel(source);
    if (s) foundSources.push(s);
    return "";
  });

  const dedupedSources = Array.from(new Set(foundSources));
  const blocks = splitParagraphs(textWithoutSources).map(parseParagraph);

  return { blocks, sources: dedupedSources };
}
