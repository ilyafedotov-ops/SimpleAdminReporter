import fs from "fs";
import path from "path";

/**
 * Resolve database schema directory across local dev, Docker, and CI layouts.
 */
export function getDatabaseRoot(): string {
  const candidates = [
    process.env.DATABASE_SCHEMA_PATH,
    path.resolve(process.cwd(), "database"),
    path.resolve(process.cwd(), "../database"),
    path.resolve(__dirname, "../../database"),
    path.resolve(__dirname, "../../../database"),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "init.sql"))) {
      return candidate;
    }
  }

  throw new Error(
    "Database schema directory not found. Expected init.sql in database/",
  );
}
