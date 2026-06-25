import { z } from "zod";

export const WaitlistEnvSchema = z.object({
  ORBITA_WAITLIST_ALLOWED_ORIGINS: z.string().optional(),
  ORBITA_INSTANCE_FROM_EMAIL: z.string().email().optional(),
  ZEABUR_ZSEND_API_KEY: z.string().min(1).optional(),
  ORBITA_WAITLIST_INVITE_CLIENT_ID: z.string().min(1).optional(),
  ORBITA_PUBLIC_BASE_URL: z.string().url().optional(),
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
