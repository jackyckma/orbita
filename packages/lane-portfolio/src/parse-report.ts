/** Extract embedded hub report JSON from a collector note body. */
const JSON_BLOCK_RE = /<!-- orbita-hub-report-json\n([\s\S]*?)\n-->/;

export function parseHubReportFromNoteBody(
  body: string,
): Record<string, unknown> | null {
  const match = body.match(JSON_BLOCK_RE);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
