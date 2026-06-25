import PostalMime from "postal-mime";

export interface Env {
  ORBITA_API_URL: string;
  ORBITA_INBOUND_EMAIL_TOKEN: string;
}

function headerAddress(headers: Headers, name: string): string {
  return headers.get(name)?.trim() ?? "";
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    const token = env.ORBITA_INBOUND_EMAIL_TOKEN?.trim();
    if (!token) {
      message.setReject("Inbound email worker is not configured");
      return;
    }

    const parsed = await PostalMime.parse(message.raw);
    const from =
      parsed.from?.address?.trim() ||
      headerAddress(message.headers, "from") ||
      message.from;
    const to =
      parsed.to?.[0]?.address?.trim() ||
      headerAddress(message.headers, "to") ||
      message.to;
    const subject = parsed.subject?.trim() || headerAddress(message.headers, "subject");
    const text =
      parsed.text?.trim() ||
      (parsed.html ? stripHtml(parsed.html) : "") ||
      "(empty body)";
    const messageId =
      parsed.messageId?.trim() || headerAddress(message.headers, "message-id") || undefined;

    const apiUrl = env.ORBITA_API_URL.replace(/\/$/, "");
    const response = await fetch(`${apiUrl}/v1/inbound/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-orbita-inbound-token": token,
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
        message_id: messageId,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Orbita inbound email failed", response.status, detail.slice(0, 500));
      message.setReject(`Orbita API rejected inbound email (${response.status})`);
      return;
    }

    const result = (await response.json()) as { session_id?: string; queued?: boolean };
    console.log("Orbita inbound email processed", {
      from,
      to,
      subject,
      session_id: result.session_id,
    });
  },
} satisfies ExportedHandler<Env>;

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
