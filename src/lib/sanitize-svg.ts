/** ينظّف كود SVG المولَّد من أي وسوم أو خصائص غير آمنة قبل عرضه في الصفحة. */
export function sanitizeSvg(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/<svg[\s\S]*<\/svg>/i);
  if (!match) return null;

  return match[0]
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}
