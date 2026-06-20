import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { notFound } from "@orbita/platform";
import { AgentProfileSchema, type AgentProfile, type AgentProfileSnapshot } from "./types.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const profilesDir = join(moduleDir, "..", "profiles");

function profilePath(id: string): string {
  return join(profilesDir, `${id}.json`);
}

function skillPath(name: string): string {
  return join(profilesDir, "skills", `${name}.md`);
}

export function listProfileIds(): string[] {
  return readdirSync(profilesDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""));
}

export function loadProfile(id: string): AgentProfile {
  try {
    const raw = readFileSync(profilePath(id), "utf8");
    return AgentProfileSchema.parse(JSON.parse(raw));
  } catch {
    throw notFound(`Agent profile not found: ${id}`);
  }
}

export function bindProfileSnapshot(id: string): AgentProfileSnapshot {
  const profile = loadProfile(id);
  const skill_contents: Record<string, string> = {};
  for (const skill of profile.skills) {
    skill_contents[skill] = readFileSync(skillPath(skill), "utf8");
  }
  return {
    ...profile,
    skill_contents,
    bound_at: new Date().toISOString(),
  };
}
