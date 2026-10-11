import { z } from "zod";

export const AuthFailEnvSchema = z.object({
  maxFailures: z.coerce.number().int().positive().default(20),
  windowSeconds: z.coerce.number().int().positive().default(300),
  trustedProxyHops: z.coerce.number().int().nonnegative().default(1),
  scannerTripwireUnits: z.coerce.number().int().positive().default(5),
  scannerBlockSeconds: z.coerce.number().int().positive().default(600),
});

export type AuthFailConfig = z.infer<typeof AuthFailEnvSchema>;

export function authFailConfigFromPlatformEnv(env: {
  ORBITA_AUTH_FAIL_MAX?: number;
  ORBITA_AUTH_FAIL_WINDOW_SECONDS?: number;
  ORBITA_TRUSTED_PROXY_HOPS?: number;
  ORBITA_SCANNER_TRIPWIRE_UNITS?: number;
  ORBITA_SCANNER_BLOCK_SECONDS?: number;
}): AuthFailConfig {
  return AuthFailEnvSchema.parse({
    maxFailures: env.ORBITA_AUTH_FAIL_MAX,
    windowSeconds: env.ORBITA_AUTH_FAIL_WINDOW_SECONDS,
    trustedProxyHops: env.ORBITA_TRUSTED_PROXY_HOPS,
    scannerTripwireUnits: env.ORBITA_SCANNER_TRIPWIRE_UNITS,
    scannerBlockSeconds: env.ORBITA_SCANNER_BLOCK_SECONDS,
  });
}
