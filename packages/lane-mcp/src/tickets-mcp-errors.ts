import type { RepositoryError } from "@orbita/tickets";

export function repositoryErrorMessage(error: RepositoryError): string {
  const details =
    error.details && Object.keys(error.details).length > 0
      ? ` ${JSON.stringify(error.details)}`
      : "";
  return `${error.code}: ${error.message}${details}`;
}

export function privilegedDeniedMessage(): string {
  return "forbidden: Ticket approver API key not allowlisted";
}
