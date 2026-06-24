import { describe, expect, it } from "vitest";
import { bindProfileSnapshot, listProfileIds, loadProfile } from "./loader.js";

describe("profiles", () => {
  it("lists and loads default profile", () => {
    expect(listProfileIds()).toContain("default");
    const profile = loadProfile("default");
    expect(profile.model.provider).toBe("minimax");
  });

  it("binds immutable snapshot with skills", () => {
    const snapshot = bindProfileSnapshot("default");
    expect(snapshot.skill_contents.core).toContain("Core skill");
    expect(snapshot.bound_at).toBeTruthy();
  });

  it("loads research, coding, and marketing profiles", () => {
    expect(listProfileIds()).toEqual(
      expect.arrayContaining(["research", "coding", "marketing"]),
    );
    const research = bindProfileSnapshot("research");
    expect(research.skills).toEqual(["core", "research", "api_http"]);
    expect(research.allowed_tools).toContain("http_post");
    const coding = bindProfileSnapshot("coding");
    expect(coding.skills).toEqual(["core", "coding"]);
    expect(coding.allowed_tools).toContain("hash_sha256");
    const marketing = bindProfileSnapshot("marketing");
    expect(marketing.skills).toEqual(["core", "marketing-draft"]);
    expect(marketing.allowed_tools).toContain("memory_put");
  });
});
