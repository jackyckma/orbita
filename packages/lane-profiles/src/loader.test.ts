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
});
