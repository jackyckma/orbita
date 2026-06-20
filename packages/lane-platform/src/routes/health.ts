import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { ApiErrorBodySchema } from "../errors.js";

const HealthResponseSchema = z
  .object({
    status: z.literal("ok"),
    version: z.string(),
    uptime_seconds: z.number().int().nonnegative(),
  })
  .openapi("HealthResponse");

const startedAt = Date.now();

export function createHealthRoutes(version: string): OpenAPIHono {
  const app = new OpenAPIHono();

  const healthRoute = createRoute({
    method: "get",
    path: "/health",
    tags: ["Platform"],
    summary: "Health check",
    responses: {
      200: {
        description: "Service is healthy",
        content: {
          "application/json": {
            schema: HealthResponseSchema,
          },
        },
      },
      500: {
        description: "Service unhealthy",
        content: {
          "application/json": {
            schema: ApiErrorBodySchema,
          },
        },
      },
    },
  });

  app.openapi(healthRoute, (c) => {
    return c.json(
      {
        status: "ok" as const,
        version,
        uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
      },
      200,
    );
  });

  return app;
}
