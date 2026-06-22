import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "hono";
import { Hono } from "hono";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(moduleDir, "..", "public");

function readPublic(name: string): string | null {
  const path = join(publicDir, name);
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, "utf8");
}

export function createAdminConsoleRoutes(): Hono {
  const app = new Hono();

  const serve =
    (file: string, contentType: string) =>
    (c: Context): Response => {
      const body = readPublic(file);
      if (!body) {
        return c.text("Admin console assets not found", 404);
      }
      return c.body(body, 200, { "Content-Type": contentType });
    };

  app.get("/admin", serve("index.html", "text/html; charset=utf-8"));
  app.get("/admin/", serve("index.html", "text/html; charset=utf-8"));
  app.get("/admin/admin.js", serve("admin.js", "application/javascript; charset=utf-8"));
  app.get("/admin/admin.css", serve("admin.css", "text/css; charset=utf-8"));

  return app;
}
