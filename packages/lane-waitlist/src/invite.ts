export type ZsendInviteInput = {
  apiKey: string;
  fromEmail: string;
  toEmail: string;
  zsendApiKey: string;
  apiBaseUrl: string;
};

export async function sendWaitlistInviteEmail(input: ZsendInviteInput): Promise<void> {
  const subject = "Your Orbita API access";
  const text = [
    "Thanks for joining the Orbita waitlist — your early access is approved.",
    "",
    `API base URL: ${input.apiBaseUrl}`,
    `API key (shown once — store it securely): ${input.apiKey}`,
    "",
    "Quick start:",
    `  curl ${input.apiBaseUrl}/v1/health`,
    "",
    "Documentation: https://get-orbita.com/docs/quick-start.html",
    "",
    "Do not share this key. Reply if you need help.",
  ].join("\n");

  const html = [
    "<p>Thanks for joining the Orbita waitlist — your early access is approved.</p>",
    `<p><strong>API base URL:</strong> ${input.apiBaseUrl}</p>`,
    "<p><strong>API key</strong> (shown once — store it securely):</p>",
    `<pre style="font-family:monospace;background:#f4f4f4;padding:12px;border-radius:6px">${input.apiKey}</pre>`,
    "<p><a href=\"https://get-orbita.com/docs/quick-start.html\">Quick start guide</a></p>",
    "<p>Do not share this key.</p>",
  ].join("");

  const response = await fetch("https://api.zeabur.com/api/v1/zsend/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.zsendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.fromEmail,
      to: [input.toEmail],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ZSend invite failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}
