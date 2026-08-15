import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PortfolioProject, PortfolioRegistry } from "./types.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve portfolio-registry.json — single founder-owned file under docs/personal-steward.
 * Prod image copies it next to the API working tree (see Dockerfile).
 */
export function resolvePortfolioRegistryPath(
  cwd = process.cwd(),
): string {
  if (process.env.ORBITA_PORTFOLIO_REGISTRY_PATH) {
    const p = process.env.ORBITA_PORTFOLIO_REGISTRY_PATH;
    return isAbsolute(p) ? p : resolve(cwd, p);
  }
  const candidates = [
    join(cwd, "docs/personal-steward/portfolio-registry.json"),
    join(cwd, "../../docs/personal-steward/portfolio-registry.json"),
    // From packages/lane-portfolio/dist → repo root
    join(moduleDir, "../../../docs/personal-steward/portfolio-registry.json"),
    // Bundled fallback shipped with the package (kept in sync with docs)
    join(moduleDir, "../data/portfolio-registry.json"),
  ];
  for (const c of candidates) {
    try {
      readFileSync(c, "utf8");
      return c;
    } catch {
      // try next
    }
  }
  return candidates[0]!;
}

export function loadPortfolioRegistry(
  path = resolvePortfolioRegistryPath(),
): PortfolioRegistry {
  const raw = JSON.parse(readFileSync(path, "utf8")) as PortfolioRegistry;
  if (!Array.isArray(raw.projects)) {
    throw new Error(`portfolio-registry missing projects array: ${path}`);
  }
  return raw;
}

export function enabledPortfolioProjects(
  registry: PortfolioRegistry = loadPortfolioRegistry(),
): PortfolioProject[] {
  return registry.projects.filter((p) => p.enabled);
}

/** Heuristic: notes mention Private, or slug is a known private product. */
export function isLikelyPrivateRepo(project: PortfolioProject): boolean {
  const notes = project.notes ?? "";
  if (/private/i.test(notes)) return true;
  return ["powerhouse", "ai-business", "vios"].includes(project.slug);
}

/** Projects that participate in the Zeabur deploy line. */
export function zeaburPortfolioProjects(
  registry: PortfolioRegistry = loadPortfolioRegistry(),
): PortfolioProject[] {
  return enabledPortfolioProjects(registry).filter(
    (p) => typeof p.zeabur_project_name === "string" && p.zeabur_project_name.trim().length > 0,
  );
}
