# SearXNG for Orbita `web_search` (self-hosted meta-search).

Deploy on Zeabur in project `6a37d39a6d107f2b4271712f` as service `orbita-searxng`.

After deploy, set on **orbita-api** service:

- `ORBITA_WEB_SEARCH_PROVIDER=searxng`
- `ORBITA_SEARXNG_BASE_URL=https://<searxng-host>` (no trailing slash)

Run `./scripts/setup-web-search-prod.sh` to merge HTTP allow-list + env vars.
