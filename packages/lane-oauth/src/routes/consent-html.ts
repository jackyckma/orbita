export function renderConsentPage(input: {
  clientName: string;
  defaultClientId: string;
  params: Record<string, string>;
  error?: string;
}): string {
  const hiddenFields = Object.entries(input.params)
    .map(
      ([key, value]) =>
        `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}" />`,
    )
    .join("\n");

  const errorBlock = input.error
    ? `<p class="error">${escapeHtml(input.error)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize Orbita MCP</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 3rem auto; padding: 0 1rem; color: #111; }
    h1 { font-size: 1.25rem; }
    p { line-height: 1.5; }
    label { display: block; margin: 0.75rem 0 0.25rem; font-weight: 600; }
    input[type="password"], input[type="text"] { width: 100%; padding: 0.5rem; box-sizing: border-box; }
    button { margin-top: 1rem; padding: 0.6rem 1rem; background: #111; color: #fff; border: 0; border-radius: 6px; cursor: pointer; }
    .error { color: #b00020; }
    .muted { color: #555; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>Connect Claude to Orbita</h1>
  <p><strong>${escapeHtml(input.clientName)}</strong> is requesting access to your Orbita memory via MCP.</p>
  <p class="muted">Enter your Orbita API key once to authorize. Claude will receive OAuth tokens — your key is not stored.</p>
  ${errorBlock}
  <form method="post" action="/oauth/authorize">
    ${hiddenFields}
    <label for="api_key">Orbita API key</label>
    <input id="api_key" name="api_key" type="password" autocomplete="off" required />
    <label for="orbita_client_id">Orbita client_id</label>
    <input id="orbita_client_id" name="orbita_client_id" type="text" value="${escapeHtml(input.defaultClientId)}" required />
    <button type="submit">Authorize</button>
  </form>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
