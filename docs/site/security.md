# Security notes

## Failed authentication rate limiting

Orbita counts **failed authentication attempts per client IP** (API key, MCP, admin, OAuth, and device approve flows). After too many failures in a sliding window, the API returns **429** with a `Retry-After` header. Successful authentication is unaffected by other IPs.

| Variable | Default | Meaning |
|----------|---------|---------|
| `ORBITA_AUTH_FAIL_MAX` | `20` | Failed attempts allowed per IP per window |
| `ORBITA_AUTH_FAIL_WINDOW_SECONDS` | `300` | Fixed window length (seconds) |
| `ORBITA_TRUSTED_PROXY_HOPS` | `1` | How many rightmost `X-Forwarded-For` hops to trust (Zeabur: 1) |
| `ORBITA_SCANNER_TRIPWIRE_UNITS` | `5` | Failure units added when a scanner decoy path is hit |
| `ORBITA_SCANNER_BLOCK_SECONDS` | `600` | Temporary IP block after a scanner tripwire hit |

Counters are held **in memory per API process** (simple and fast; resets on deploy/restart). Auth failures are logged with `ip`, `path`, `reason`, and `key_prefix` (first 12 characters of a presented bearer token only — never the full secret).

Scanner decoy paths (`/.env`, `/wp-admin`, `/wp-login.php`, `/.git/config`, `/phpmyadmin`) return a plain **404** and contribute to the limiter. They do not replace real routes.

There is **no tarpit** (the server never sleeps on failed auth).
