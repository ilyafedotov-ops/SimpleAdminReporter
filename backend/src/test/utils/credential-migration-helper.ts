/**
 * Credential Migration Helper
 * 
 * Utilities to help migrate hardcoded test credentials to secure patterns
 */

export interface CredentialPattern {
  readonly original: RegExp;
  readonly replacement: string;
  readonly description: string;
}

/**
 * Common insecure patterns and their secure replacements
 */
export const CREDENTIAL_MIGRATIONS: CredentialPattern[] = [
  {
    original: /password:\s*['"`]password123['"`]/g,
    replacement: "password: testCredentials.validUser.password",
    description: "Replace hardcoded password123 with secure test credential"
  },
  {
    original: /password:\s*['"`]testpass123['"`]/g,
    replacement: "password: testCredentials.validUser.password",
    description: "Replace hardcoded testpass123 with secure test credential"
  },
  {
    original: /password:\s*['"`]password['"`]/g,
    replacement: "password: testCredentials.validUser.password",
    description: "Replace generic hardcoded password with secure test credential"
  },
  {
    original: /password:\s*['"`]admin123['"`]/g,
    replacement: "password: testCredentials.adminUser.password",
    description: "Replace hardcoded admin password with secure test credential"
  },
  {
    original: /['"`]ldap:\/\/test-server['"`]/g,
    replacement: "testCredentials.ldapConfig.server",
    description: "Replace hardcoded LDAP server with secure test config"
  },
  {
    original: /['"`]redis:\/\/localhost:6379['"`]/g,
    replacement: "testCredentials.redisUrl",
    description: "Replace hardcoded Redis URL with secure test config"
  },
  {
    original: /['"`]CN=.*,DC=test,DC=local['"`]/g,
    replacement: "testCredentials.ldapConfig.username",
    description: "Replace hardcoded LDAP DN with secure test config"
  }
];

/**
 * Required imports for migrated files
 */
export const REQUIRED_IMPORTS = `import { testCredentials, MockCredentialGenerator } from '../test/fixtures/secure-test-credentials';`;

/**
 * Migration helper functions
 */
export class CredentialMigrationHelper {
  /**
   * Check if file needs migration
   */
  static needsMigration(content: string): boolean {
    return CREDENTIAL_MIGRATIONS.some(pattern => pattern.original.test(content));
  }

  /**
   * Apply credential migrations to file content
   */
  static migrateContent(content: string): { content: string; changes: string[] } {
    let migratedContent = content;
    const changes: string[] = [];

    // Add imports if not present and needed
    if (this.needsMigration(content) && !content.includes('secure-test-credentials')) {
      migratedContent = REQUIRED_IMPORTS + '\n\n' + migratedContent;
      changes.push('Added secure test credentials import');
    }

    // Apply each migration pattern
    for (const pattern of CREDENTIAL_MIGRATIONS) {
      const matches = migratedContent.match(pattern.original);
      if (matches) {
        migratedContent = migratedContent.replace(pattern.original, pattern.replacement);
        changes.push(`${pattern.description} (${matches.length} occurrences)`);
      }
    }

    return { content: migratedContent, changes };
  }

  /**
   * Generate migration report
   */
  static generateMigrationReport(filePath: string, changes: string[]): string {
    return `
Migration Report for ${filePath}
${'='.repeat(50)}
Changes applied:
${changes.map(change => `  ✓ ${change}`).join('\n')}

Security improvements:
  ✓ Removed hardcoded credentials
  ✓ Added centralized test credential management
  ✓ Eliminated Gitleaks violations
  ✓ Maintained test functionality
`;
  }
}

/**
 * Validation helpers
 */
export class MigrationValidator {
  /**
   * Validate that no hardcoded credentials remain
   */
  static validateMigration(content: string): { isValid: boolean; violations: string[] } {
    const violations: string[] = [];
    
    // Check for common hardcoded patterns
    const dangerousPatterns = [
      /password:\s*['"`](password|admin|test|123)[^'"`]*['"`]/gi,
      /['"`][^'"`]*password[^'"`]*['"`]/gi,
      /secret:\s*['"`][^'"`]{8,}['"`]/gi
    ];

    for (const pattern of dangerousPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        violations.push(...matches);
      }
    }

    return {
      isValid: violations.length === 0,
      violations
    };
  }

  /**
   * Generate validation report
   */
  static generateValidationReport(filePath: string, isValid: boolean, violations: string[]): string {
    if (isValid) {
      return `✅ ${filePath}: Migration successful - No security violations detected`;
    }

    return `
❌ ${filePath}: Migration incomplete
Remaining violations:
${violations.map(v => `  - ${v}`).join('\n')}

Please review and address these patterns manually.
`;
  }
}