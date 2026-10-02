import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const SCRIPTS = join(ROOT, "scripts");

describe("portfolio shell scripts", () => {
  const portfolioScripts = readdirSync(SCRIPTS).filter((f) => f.startsWith("portfolio-") && f.endsWith(".sh"));

  it("pass bash -n on every scripts/portfolio-*.sh", () => {
    for (const name of portfolioScripts) {
      execSync(`bash -n ${join(SCRIPTS, name)}`, { cwd: ROOT, stdio: "pipe" });
    }
    expect(portfolioScripts.length).toBeGreaterThan(0);
  });

  it("setup harness DRY_RUN emits valid JSON with expected template ids", () => {
    const env = { ...process.env, DRY_RUN: "1", ORBITA_CLIENT_ID: "test-tenant" };
    const zeabur = execSync("bash scripts/portfolio-zeabur-collect-setup-harness.sh", {
      cwd: ROOT,
      env,
      encoding: "utf8",
    });
    const zeaburJson = JSON.parse(zeabur.trim()) as { template_id: string };
    expect(zeaburJson.template_id).toBe("portfolio-zeabur-collect@v1");

    const git = execSync("bash scripts/portfolio-git-collect-setup-harness.sh", {
      cwd: ROOT,
      env,
      encoding: "utf8",
    });
    const gitJson = JSON.parse(git.trim()) as { template_id: string };
    expect(gitJson.template_id).toBe("portfolio-git-collect@v1");
  });
});
