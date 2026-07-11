import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { logger } from "../utils/logger";
import { getDatabaseRoot } from "../utils/database-path";

const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(500) NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
  );
`;

interface MigrationFile {
  version: string;
  name: string;
  filePath: string;
}

function getMigrationFiles(migrationsDir: string): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  return fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql") && !file.includes("rollback"))
    .sort()
    .map((file) => {
      const version = file.split("_")[0];
      const name = file.replace(".sql", "");
      return {
        version,
        name,
        filePath: path.join(migrationsDir, file),
      };
    });
}

async function getAppliedVersions(pool: Pool): Promise<Set<string>> {
  const result = await pool.query("SELECT version FROM schema_migrations");
  return new Set(result.rows.map((row) => row.version));
}

function buildDatabaseUrl(): string {
  const user = process.env.DB_USER || process.env.POSTGRES_USER || "postgres";
  const password = process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD;
  const host = process.env.DB_HOST || "localhost";
  const port = process.env.DB_PORT || "5432";
  const database =
    process.env.DB_NAME || process.env.POSTGRES_DB || "reporting";
  const credentials = password ? `${user}:${password}` : user;
  return `postgresql://${credentials}@${host}:${port}/${database}`;
}

async function runMigrations(): Promise<void> {
  const connectionString = process.env.DATABASE_URL || buildDatabaseUrl();

  const pool = new Pool({ connectionString });

  try {
    await pool.query(MIGRATIONS_TABLE);

    const databaseRoot = getDatabaseRoot();
    const migrationsDir = path.join(databaseRoot, "migrations");
    const initSqlPath = path.join(databaseRoot, "init.sql");
    const appliedVersions = await getAppliedVersions(pool);

    if (!appliedVersions.has("001") && fs.existsSync(initSqlPath)) {
      logger.info("Applying initial schema from database/init.sql");
      const initSql = fs.readFileSync(initSqlPath, "utf8");
      await pool.query(initSql);
      appliedVersions.add("001");
      logger.info("Initial schema applied successfully");
    }

    const migrationFiles = getMigrationFiles(migrationsDir);

    for (const migration of migrationFiles) {
      if (appliedVersions.has(migration.version)) {
        logger.info(`Skipping already applied migration: ${migration.name}`);
        continue;
      }

      logger.info(`Applying migration: ${migration.name}`);
      const sql = fs.readFileSync(migration.filePath, "utf8");

      await pool.query("BEGIN");
      try {
        await pool.query(sql);
        await pool.query(
          "INSERT INTO schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
          [migration.version, migration.name],
        );
        await pool.query("COMMIT");
        logger.info(`Migration applied: ${migration.name}`);
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    }

    logger.info("All migrations completed successfully");
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error("Migration failed:", error);
      process.exit(1);
    });
}

export { runMigrations };
