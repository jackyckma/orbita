import { describe, expect, it } from "vitest";
import { executeToolCall } from "./registry.js";

describe("executeToolCall", () => {
  it("runs echo", async () => {
    const result = await executeToolCall(
      "echo",
      JSON.stringify({ text: "hello" }),
      ["echo"],
      { clientId: "test", resolveCredential: async () => "unused" },
    );
    expect(result.success).toBe(true);
    expect(result.result).toEqual({ echoed: "hello" });
  });

  it("rejects disallowed tools", async () => {
    const result = await executeToolCall(
      "http_get",
      JSON.stringify({ url: "https://example.com" }),
      ["echo"],
      { clientId: "test", resolveCredential: async () => "unused" },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("not allowed");
  });
});
