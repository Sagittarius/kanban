declare module "pg" {
  export class Pool {
    constructor(config: { connectionString?: string; ssl?: { ca?: string; rejectUnauthorized?: boolean } | boolean });
    query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
    end(): Promise<void>;
  }
}
