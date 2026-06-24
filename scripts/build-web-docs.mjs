#!/usr/bin/env node
/**
 * Build public docs from docs/site/*.md → apps/orbita-web/public/docs/
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SITE_SRC = path.join(ROOT, "docs", "site");
const OUT_DIR = path.join(ROOT, "apps", "orbita-web", "public", "docs");

marked.setOptions({ gfm: true, headerIds: true, mangle: false });

function parseFrontmatter(raw) {
  if (!raw.startsWith("---\n")) {
    return { meta: {}, body: raw };
  }
  const end = raw.indexOf("\n---\n", 4);
  if (end === -1) {
    return { meta: {}, body: raw };
  }
  const block = raw.slice(4, end);
  const body = raw.slice(end + 5);
  const meta = {};
  for (const line of block.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    meta[key] = key === "nav_order" ? Number(value) : value;
  }
  return { meta, body };
}

function slugFromFile(file) {
  return file === "index.md" ? "index" : file.replace(/\.md$/, "");
}

function loadPages() {
  const files = fs.readdirSync(SITE_SRC).filter((f) => f.endsWith(".md"));
  const pages = files.map((file) => {
    const raw = fs.readFileSync(path.join(SITE_SRC, file), "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const slug = slugFromFile(file);
    return {
      file,
      slug,
      outName: slug === "index" ? "index.html" : `${slug}.html`,
      title: meta.title || slug,
      description: meta.description || "",
      nav_order: meta.nav_order ?? 99,
      html: marked.parse(body),
    };
  });
  pages.sort((a, b) => a.nav_order - b.nav_order || a.title.localeCompare(b.title));
  return pages;
}

function renderPage(page, navPages) {
  const nav = navPages
    .map((p) => {
      const href = p.slug === "index" ? "/docs/" : `/docs/${p.slug}.html`;
      const active = p.slug === page.slug ? ' aria-current="page"' : "";
      return `<a href="${href}"${active}>${escapeHtml(p.title)}</a>`;
    })
    .join("\n          ");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${escapeHtml(page.description)}" />
    <title>${escapeHtml(page.title)} — Orbita Docs</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Syne:wght@600;700&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <header>
      <div class="wrap nav">
        <a class="logo" href="/">Orbit<span>a</span></a>
        <nav class="nav-links">
          <a href="/">Home</a>
          <a href="/docs/">Docs</a>
          <a href="https://api.get-orbita.com/v1/openapi.json" rel="noopener">OpenAPI</a>
          <a href="https://github.com/jackyckma/orbita" rel="noopener">GitHub</a>
        </nav>
      </div>
    </header>

    <main class="page-main">
      <div class="wrap docs-layout">
        <aside class="docs-sidebar">
          <p class="eyebrow">Documentation</p>
          <nav class="docs-nav">
          ${nav}
          </nav>
        </aside>
        <article class="doc-content">
          ${page.html}
        </article>
      </div>
    </main>

    <footer>
      <div class="wrap">
        <span>Orbita — agent-native API</span>
        <span>
          <a href="/">Home</a>
          ·
          <a href="/updates.html">Updates</a>
          ·
          <a href="https://api.get-orbita.com/v1/health" rel="noopener">API</a>
        </span>
      </div>
    </footer>
  </body>
</html>
`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function main() {
  if (!fs.existsSync(SITE_SRC)) {
    console.error("Missing docs/site/");
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const pages = loadPages();
  for (const page of pages) {
    const html = renderPage(page, pages);
    fs.writeFileSync(path.join(OUT_DIR, page.outName), html);
    console.log(`  wrote docs/${page.outName}`);
  }
  console.log(`Built ${pages.length} doc page(s) → apps/orbita-web/public/docs/`);
}

main();
