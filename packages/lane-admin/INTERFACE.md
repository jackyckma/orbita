# Lane 10 — Admin console

Single-user admin UI and deployment settings.

## Provides

- `GET /admin` — static console
- `POST /v1/admin/session` — admin token → HttpOnly cookie
- `GET/DELETE /v1/admin/session`
- `GET /v1/admin/api-keys`, `POST`, `DELETE` (via lane-auth)
- `GET/POST /v1/admin/credentials` (via lane-credentials)
- `GET /v1/admin/settings`, `PUT /v1/admin/settings/http-domains`

## See also

- `docs/admin-ui-brainstorm.md`
