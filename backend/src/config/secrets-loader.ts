import fs from "fs";
import { logger } from "../utils/logger";

const SECRET_FILE_MAPPINGS: Record<string, string> = {
  DATABASE_URL: "DATABASE_URL_FILE",
  JWT_SECRET: "JWT_SECRET_FILE",
  SESSION_SECRET: "SESSION_SECRET_FILE",
  COOKIE_SECRET: "COOKIE_SECRET_FILE",
  REDIS_PASSWORD: "REDIS_PASSWORD_FILE",
  REDIS_URL: "REDIS_URL_FILE",
  AD_PASSWORD: "AD_PASSWORD_FILE",
  AZURE_CLIENT_SECRET: "AZURE_CLIENT_SECRET_FILE",
  CREDENTIAL_ENCRYPTION_KEY: "CREDENTIAL_ENCRYPTION_KEY_FILE",
  CREDENTIAL_ENCRYPTION_SALT: "CREDENTIAL_ENCRYPTION_SALT_FILE",
};

const WEAK_SECRETS = new Set([
  "default-cookie-secret",
  "development-secret-change-in-production",
  "development-refresh-secret",
  "redis123",
  "changeme",
  "password",
  "secret",
]);

function readSecretFile(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Secret file not found: ${filePath}`);
  }

  const value = fs.readFileSync(filePath, "utf8").trim();
  if (!value) {
    throw new Error(`Secret file is empty: ${filePath}`);
  }

  return value;
}

/**
 * Load Docker secret *_FILE variables into process.env before config initialization.
 */
export function loadSecretsFromFiles(): void {
  for (const [envVar, fileVar] of Object.entries(SECRET_FILE_MAPPINGS)) {
    const filePath = process.env[fileVar];
    if (!filePath) {
      continue;
    }

    if (!process.env[envVar]) {
      process.env[envVar] = readSecretFile(filePath);
      logger.info(`Loaded secret for ${envVar} from ${fileVar}`);
    }
  }
}

/**
 * Fail closed in production when required secrets are missing or weak.
 */
export function validateProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const requiredSecrets = [
    "JWT_SECRET",
    "SESSION_SECRET",
    "COOKIE_SECRET",
    "CREDENTIAL_ENCRYPTION_KEY",
  ];

  const missing: string[] = [];
  const weak: string[] = [];

  for (const secret of requiredSecrets) {
    const value = process.env[secret];
    if (!value) {
      missing.push(secret);
      continue;
    }

    if (WEAK_SECRETS.has(value) || value.length < 16) {
      weak.push(secret);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required production secrets: ${missing.join(", ")}`,
    );
  }

  if (weak.length > 0) {
    throw new Error(
      `Weak or default production secrets detected: ${weak.join(", ")}`,
    );
  }
}
