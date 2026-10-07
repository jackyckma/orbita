export type CredentialMetadata = {
  client_id: string;
  name: string;
  scopes: string[];
  created_at: string;
  rotated_at: string | null;
  expires_at: string | null;
};

export function formatCredentialMetadata(row: {
  clientId: string;
  name: string;
  scopes: string[];
  createdAt: Date;
  rotatedAt: Date | null;
  expiresAt: Date | null;
}): CredentialMetadata {
  return {
    client_id: row.clientId,
    name: row.name,
    scopes: row.scopes,
    created_at: row.createdAt.toISOString(),
    rotated_at: row.rotatedAt?.toISOString() ?? null,
    expires_at: row.expiresAt?.toISOString() ?? null,
  };
}
