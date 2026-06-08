declare module "pg" {
  export class Pool {
    constructor(options?: Record<string, unknown>);
    query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
    end(): Promise<void>;
  }
}
