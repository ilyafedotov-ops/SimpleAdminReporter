/**
 * Tables permitted for dynamic PostgreSQL query building.
 * Sensitive tables (users, credentials, audit) are excluded by design.
 */
export const ALLOWED_QUERY_TABLES = new Set([
  "report_templates",
  "report_history",
  "custom_report_templates",
  "report_schedules",
  "field_metadata",
  "query_definitions",
  "query_metrics",
  "notifications",
]);

/**
 * Columns that must never be selected via dynamic query builder.
 */
export const BLOCKED_QUERY_COLUMNS = new Set([
  "password_hash",
  "encrypted_password",
  "encrypted_client_secret",
  "encrypted_token",
  "refresh_token",
  "access_token",
  "client_secret",
  "encryption_key",
]);

export function isAllowedQueryTable(table: string): boolean {
  return ALLOWED_QUERY_TABLES.has(table);
}

export function assertAllowedQueryColumns(fields: string[]): void {
  for (const field of fields) {
    const column = field.includes(".") ? field.split(".").pop()! : field;
    if (BLOCKED_QUERY_COLUMNS.has(column.toLowerCase())) {
      throw new Error(`Access to column '${column}' is not permitted`);
    }
  }
}
