/** Documented fallback until E-14 phase 2 (D-003) removes it. */
export const DEPRECATED_HUB_CLIENT_ID_FALLBACK = "personal-jacky";

export type HubClientIdEnv = {
  ORBITA_HUB_CLIENT_ID?: string;
};

export type ResolveHubClientIdOptions = {
  /** Injectable for tests; defaults to console.warn. */
  warn?: (message: string) => void;
};

let fallbackWarningEmitted = false;

/** Test-only: reset one-shot warning state between cases. */
export function resetHubClientIdWarningForTests(): void {
  fallbackWarningEmitted = false;
}

function defaultWarn(message: string): void {
  console.warn(message);
}

/**
 * Returns explicit ORBITA_HUB_CLIENT_ID when set; otherwise the deprecated
 * fallback and a one-shot startup warning.
 */
export function resolveHubClientId(
  env: HubClientIdEnv,
  options?: ResolveHubClientIdOptions,
): string {
  const explicit = env.ORBITA_HUB_CLIENT_ID?.trim();
  if (explicit) {
    return explicit;
  }

  if (!fallbackWarningEmitted) {
    fallbackWarningEmitted = true;
    (options?.warn ?? defaultWarn)("deprecated default tenant in use");
  }

  return DEPRECATED_HUB_CLIENT_ID_FALLBACK;
}
