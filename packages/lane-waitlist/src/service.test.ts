import { describe, expect, it, vi } from "vitest";
import { normalizeEmail } from "./service.js";
import { sendWaitlistInviteEmail } from "./invite.js";

describe("waitlist service", () => {
  it("normalizes email", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
  });
});

describe("waitlist invite email", () => {
  it("posts to ZSend with API key in body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await sendWaitlistInviteEmail({
      apiKey: "orb_testkey",
      fromEmail: "orbita@get-orbita.com",
      toEmail: "user@example.com",
      zsendApiKey: "zsend-secret",
      apiBaseUrl: "https://api.get-orbita.com",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0]!;
    const [url, opts] = call;
    expect(url).toBe("https://api.zeabur.com/api/v1/zsend/emails");
    expect(opts.headers.Authorization).toBe("Bearer zsend-secret");
    const body = JSON.parse(opts.body);
    expect(body.to).toEqual(["user@example.com"]);
    expect(body.text).toContain("orb_testkey");

    vi.unstubAllGlobals();
  });
});
