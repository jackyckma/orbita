import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "hono";
import { Hono } from "hono";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(moduleDir, "..", "public");

const ADMIN_CACHE_HEADERS = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
};

function readPublic(name: string): string | null {
  const path = join(publicDir, name);
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, "utf8");
}

function withAssetVersion(html: string, assetVersion: string): string {
  const v = encodeURIComponent(assetVersion);
  return html
    .replace("/admin/admin.css", `/admin/admin.css?v=${v}`)
    .replace("/admin/admin.js", `/admin/admin.js?v=${v}`);
}

export function createAdminConsoleRoutes(options?: { assetVersion?: string }): Hono {
  const assetVersion = options?.assetVersion ?? "1";
  const app = new Hono();

  const serve =
    (file: string, contentType: string) =>
    (c: Context): Response => {
      const body = readPublic(file);
      if (!body) {
        return c.text("Admin console assets not found", 404);
      }
      return c.body(body, 200, {
        "Content-Type": contentType,
        ...ADMIN_CACHE_HEADERS,
      });
    };

  const serveIndex = (c: Context): Response => {
    const raw = readPublic("index.html");
    if (!raw) {
      return c.text("Admin console assets not found", 404);
    }
    return c.body(withAssetVersion(raw, assetVersion), 200, {
      "Content-Type": "text/html; charset=utf-8",
      ...ADMIN_CACHE_HEADERS,
    });
  };

  app.get("/admin/device", serveIndex);
  app.get("/admin", serveIndex);
  app.get("/admin/", serveIndex);
  app.get("/admin/admin.js", serve("admin.js", "application/javascript; charset=utf-8"));
  app.get("/admin/admin.css", serve("admin.css", "text/css; charset=utf-8"));

  return app;
}
