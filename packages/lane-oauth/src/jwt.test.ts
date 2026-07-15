import { describe, expect, it } from "vitest";
import { signAccessToken, verifyAccessToken } from "./jwt.js";

describe("jwt", () => {
  it("round-trips access token claims", () => {
    const token = signAccessToken(
      {
        iss: "https://api.example.com",
        aud: "https://api.example.com/v1/mcp",
        sub: "personal-jacky",
        scope: "sessions:use",
        client_id: "oauth-client",
        ttlSeconds: 3600,
      },
      "test-secret-key-32chars-min!!!!",
    );
    const claims = verifyAccessToken(
      token,
      "test-secret-key-32chars-min!!!!",
      "https://api.example.com/v1/mcp",
    );
    expect(claims?.sub).toBe("personal-jacky");
    expect(claims?.scope).toBe("sessions:use");
  });
});
