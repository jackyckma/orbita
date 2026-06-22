import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { bindProfileSnapshot, listProfileIds, loadProfile } from "./loader.js";

export function createProfileRoutes(): OpenAPIHono {
  const app = new OpenAPIHono();

  const listRoute = createRoute({
    method: "get",
    path: "/profiles",
    tags: ["Profiles"],
    summary: "List agent profiles and tool permissions",
    responses: {
      200: {
        description: "Static profile catalog",
        content: {
          "application/json": {
            schema: z.object({
              profiles: z.array(
                z.object({
                  id: z.string(),
                  description: z.string(),
                  skills: z.array(z.string()),
                  allowed_tools: z.array(z.string()),
                  model: z.object({
                    provider: z.string(),
                    model: z.string(),
                  }),
                }),
              ),
            }),
          },
        },
      },
    },
  });

  app.openapi(listRoute, async (c) => {
    const profiles = listProfileIds().map((id) => {
      const p = loadProfile(id);
      return {
        id: p.id,
        description: p.description,
        skills: p.skills,
        allowed_tools: p.allowed_tools,
        model: p.model,
      };
    });
    return c.json({ profiles }, 200);
  });

  const getRoute = createRoute({
    method: "get",
    path: "/profiles/{profile_id}",
    tags: ["Profiles"],
    summary: "Get one profile including bound skill contents",
    request: { params: z.object({ profile_id: z.string() }) },
    responses: {
      200: {
        description: "Profile snapshot shape (without creating a session)",
        content: {
          "application/json": {
            schema: z.object({
              profile: z.record(z.unknown()),
            }),
          },
        },
      },
    },
  });

  app.openapi(getRoute, async (c) => {
    const { profile_id } = c.req.valid("param");
    const snapshot = bindProfileSnapshot(profile_id);
    return c.json(
      {
        profile: {
          id: snapshot.id,
          description: snapshot.description,
          skills: snapshot.skills,
          allowed_tools: snapshot.allowed_tools,
          model: snapshot.model,
          skill_contents: snapshot.skill_contents,
        },
      },
      200,
    );
  });

  return app;
}
