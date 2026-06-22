# Docker sandbox (W14)

Optional **Docker tier** for tool execution isolation (design §8).

## Enable

```bash
ORBITA_SANDBOX_DOCKER=1
```

Requires:

- Docker CLI on the API host
- API process can run `docker run` (socket mount in Compose)

## Tools

| Tool | When enabled | Isolation |
|------|----------------|-----------|
| `echo`, `http_*`, … | always | in-process (local tier) |
| `docker_echo` | `ORBITA_SANDBOX_DOCKER=1` | `docker run --rm --network=none alpine:3.20` |

Add `docker_echo` to profile `allowed_tools` when testing sandbox tier.

## Docker Compose

```yaml
api:
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
  environment:
    ORBITA_SANDBOX_DOCKER: "1"
```

## Roadmap

- General command sandbox (not only echo)
- Resource limits, image allow-list
- E2B managed backend option
