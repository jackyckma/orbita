import { z } from "zod";

export const WaitlistEnvSchema = z.object({
  ORBITA_WAITLIST_ALLOWED_ORIGINS: z.string().optional(),
  ORBITA_INSTANCE_FROM_EMAIL: z.string().email().optional(),
});

export type WaitlistEnv = z.infer<typeof WaitlistEnvSchema>;

export function loadWaitlistEnv(source: NodeJS.ProcessEnv = process.env): WaitlistEnv {
  return WaitlistEnvSchema.parse(source);
}

export function parseAllowedOrigins(raw: string | undefined): string[] {
  const fallback = ["https://get-orbita.com", "https://www.get-orbita.com"];
  if (!raw?.trim()) return fallback;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
