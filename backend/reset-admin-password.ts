#!/usr/bin/env ts-node
/* eslint-disable no-console */
/**
 * SECURE ADMIN PASSWORD RESET UTILITY (TypeScript Version)
 * 
 * This script securely resets the admin password with full database integration:
 * 1. Validates password strength and complexity
 * 2. Uses environment variables or secure prompting
 * 3. Implements secure bcrypt hashing with configurable rounds
 * 4. Provides comprehensive audit logging
 * 5. Includes transaction safety and rollback capabilities
 * 
 * SECURITY FEATURES:
 * - No hardcoded passwords
 * - Password complexity validation
 * - Secure input handling
 * - Audit trail logging
 * - Transaction safety
 * - Memory cleanup
 * 
 * Usage:
 *   # Using environment variable (RECOMMENDED):
 *   ADMIN_PASSWORD='your-secure-password' ts-node reset-admin-password.ts
 *   
 *   # Using interactive prompt:
 *   ts-node reset-admin-password.ts
 *   
 *   # Dry run mode (validate only, no database changes):
 *   DRY_RUN=true ADMIN_PASSWORD='test' ts-node reset-admin-password.ts
 */

import bcrypt from 'bcryptjs';
import { db } from './src/config/database';
import * as readline from 'readline';
// Crypto utilities available if needed for future enhancements

// Security configuration
const MIN_PASSWORD_LENGTH = 12;
const BCRYPT_ROUNDS = 12; // Increased for better security
const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/;
// Future enhancement: lockout management
// const MAX_LOGIN_ATTEMPTS = 3;
// const LOCKOUT_DURATION = 300; // 5 minutes

interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong';
}

interface AuditLogEntry {
  timestamp: string;
  action: string;
  username: string;
  source_ip: string;
  user_agent: string;
  success: boolean;
  details: Record<string, any>;
  session_id?: string;
}

/**
 * Validates password strength and complexity
 * @param password - Password to validate
 * @returns Validation result with details
 */
function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  let strength: 'weak' | 'medium' | 'strong' = 'weak';
  
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  }
  
  if (!PASSWORD_COMPLEXITY_REGEX.test(password)) {
    errors.push('Password must contain lowercase, uppercase, number, and special character');
  }
  
  // Check for common weak passwords
  const weakPasswords = [
    'admin123', 'Admin@123!', 'password', 'Password123!', 'admin', 
    'administrator', '123456', 'qwerty', 'letmein', 'welcome'
  ];
  
  if (weakPasswords.some(weak => password.toLowerCase().includes(weak.toLowerCase()))) {
    errors.push('Password contains common patterns. Use a more unique password.');
  }
  
  // Calculate password strength
  let score = 0;
  if (password.length >= 16) score += 2;
  else if (password.length >= 12) score += 1;
  
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 1;
  if (/[^\w\s]/.test(password)) score += 1; // Additional special chars
  
  if (score >= 6) strength = 'strong';
  else if (score >= 4) strength = 'medium';
  
  return {
    isValid: errors.length === 0,
    errors,
    strength
  };
}

/**
 * Securely prompts for password input with confirmation
 * @returns Promise resolving to the entered password
 */
function promptPassword(): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    let password = '';
    let confirmPassword = '';
    
    console.log('\n🔐 Enter new admin password (input will be hidden):');
    
    // Hide password input
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    
    let step = 1; // 1 = password, 2 = confirm
    
    stdin.on('data', (key: string) => {
      if (key === '\u0003') { // Ctrl+C
        process.exit(1);
      } else if (key === '\r' || key === '\n') { // Enter
        if (step === 1) {
          step = 2;
          console.log('\n🔐 Confirm password:');
        } else {
          stdin.setRawMode(false);
          stdin.pause();
          rl.close();
          
          if (password !== confirmPassword) {
            console.log('\n❌ Passwords do not match!');
            reject(new Error('Passwords do not match'));
          } else {
            console.log('\n✅ Passwords match');
            resolve(password);
          }
        }
      } else if (key === '\u007f') { // Backspace
        if (step === 1 && password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        } else if (step === 2 && confirmPassword.length > 0) {
          confirmPassword = confirmPassword.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        if (step === 1) {
          password += key;
        } else {
          confirmPassword += key;
        }
        process.stdout.write('*');
      }
    });
  });
}

/**
 * Logs audit event to database and console
 * @param entry - Audit log entry
 */
async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    // Log to console
    console.log('📊 Audit Log:', {
      timestamp: entry.timestamp,
      action: entry.action,
      success: entry.success
    });
    
    // Log to database (if audit_logs table exists)
    try {
      await db.query(
        `INSERT INTO audit_logs (event_type, event_action, username, ip_address, 
         user_agent, success, details, created_at, session_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          'admin_management',
          entry.action,
          entry.username,
          entry.source_ip,
          entry.user_agent,
          entry.success,
          JSON.stringify(entry.details),
          entry.timestamp,
          entry.session_id || 'password-reset-script'
        ]
      );
    } catch (dbError) {
      // If audit table doesn't exist, just log to console
      console.log('📝 Note: Could not write to audit_logs table (may not exist)');
    }
  } catch (error) {
    console.warn('⚠️  Failed to log audit event:', error);
  }
}

/**
 * Main function to reset admin password with full security features
 */
async function resetAdminPassword(): Promise<void> {
  const startTime = Date.now();
  const auditDetails: Record<string, any> = {
    script_version: 'secure-typescript-v2.0',
    bcrypt_rounds: BCRYPT_ROUNDS,
    min_password_length: MIN_PASSWORD_LENGTH
  };
  
  try {
    console.log('🔐 SECURE ADMIN PASSWORD RESET UTILITY');
    console.log('=====================================\n');
    
    // Check if we're in dry run mode
    const isDryRun = process.env.DRY_RUN === 'true';
    if (isDryRun) {
      console.log('🧪 DRY RUN MODE - No database changes will be made\n');
    }
    
    // Get password from environment or prompt
    let password = process.env.ADMIN_PASSWORD;
    
    if (!password) {
      console.log('⚠️  No ADMIN_PASSWORD environment variable found.');
      console.log('   For better security, use: ADMIN_PASSWORD="your-password" ts-node reset-admin-password.ts\n');
      
      password = await promptPassword();
    } else {
      console.log('✅ Using password from environment variable\n');
    }
    
    // Validate password strength
    console.log('🔍 Validating password strength...');
    const validation = validatePassword(password);
    
    if (!validation.isValid) {
      console.error('\n❌ Password validation failed:');
      validation.errors.forEach(error => console.error(`   • ${error}`));
      
      await logAuditEvent({
        timestamp: new Date().toISOString(),
        action: 'admin_password_reset_failed',
        username: 'admin',
        source_ip: 'localhost',
        user_agent: 'password-reset-script-ts',
        success: false,
        details: { ...auditDetails, failure_reason: 'password_validation_failed', errors: validation.errors }
      });
      
      process.exit(1);
    }
    
    console.log(`✅ Password validation passed (Strength: ${validation.strength.toUpperCase()})`);
    auditDetails.password_strength = validation.strength;
    auditDetails.password_length = password.length;
    
    // Generate secure hash
    console.log('⏳ Generating secure hash...');
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    console.log('✅ Hash generated successfully');
    
    if (isDryRun) {
      console.log('\n🧪 DRY RUN: Would execute the following SQL:');
      console.log('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP');
      console.log('WHERE username = $2 AND auth_source = $3');
      console.log('RETURNING id, username, updated_at;');
      
      // Clear sensitive data
      password = '';
      
      await logAuditEvent({
        timestamp: new Date().toISOString(),
        action: 'admin_password_reset_dry_run',
        username: 'admin',
        source_ip: 'localhost',
        user_agent: 'password-reset-script-ts',
        success: true,
        details: auditDetails
      });
      
      console.log('\n✅ Dry run completed successfully');
      return;
    }
    
    // Start database transaction for safety
    console.log('🔄 Starting database transaction...');
    await db.query('BEGIN');
    
    try {
      // Update password
      const result = await db.query(
        `UPDATE users SET 
           password_hash = $1, 
           updated_at = CURRENT_TIMESTAMP,
           failed_login_attempts = 0,
           locked_until = NULL
         WHERE username = $2 AND auth_source = $3 
         RETURNING id, username, updated_at, created_at`,
        [hashedPassword, 'admin', 'local']
      );
      
      if (result.rows.length === 0) {
        throw new Error('Admin user not found or is not a local auth user');
      }
      
      const user = result.rows[0];
      console.log('\n✅ Password reset successfully!');
      console.log('👤 User Details:');
      console.log(`   • ID: ${user.id}`);
      console.log(`   • Username: ${user.username}`);
      console.log(`   • Created: ${user.created_at}`);
      console.log(`   • Updated: ${user.updated_at}`);
      
      // Commit transaction
      await db.query('COMMIT');
      console.log('✅ Database transaction committed');
      
      // Log successful reset
      await logAuditEvent({
        timestamp: new Date().toISOString(),
        action: 'admin_password_reset_success',
        username: 'admin',
        source_ip: 'localhost',
        user_agent: 'password-reset-script-ts',
        success: true,
        details: {
          ...auditDetails,
          user_id: user.id,
          execution_time_ms: Date.now() - startTime
        }
      });
      
    } catch (dbError) {
      // Rollback transaction
      await db.query('ROLLBACK');
      // eslint-disable-next-line no-console
      console.log('🔄 Database transaction rolled back');
      throw dbError;
    }
    
    // Clear sensitive data from memory
    password = '';
    
    console.log('\n🔐 SECURITY REMINDERS:');
    console.log('   1. Test login with the new password');
    console.log('   2. Clear terminal history: history -c');
    console.log('   3. Consider enabling 2FA for admin accounts');
    console.log('   4. Review audit logs for any suspicious activity');
    console.log('   5. Update password policy if needed');
    
  } catch (error) {
    console.error('\n❌ Error during password reset:', error);
    
    // Log failed attempt
    await logAuditEvent({
      timestamp: new Date().toISOString(),
      action: 'admin_password_reset_failed',
      username: 'admin',
      source_ip: 'localhost',
      user_agent: 'password-reset-script-ts',
      success: false,
      details: {
        ...auditDetails,
        error_message: error instanceof Error ? error.message : 'Unknown error',
        execution_time_ms: Date.now() - startTime
      }
    });
    
    process.exit(1);
  } finally {
    // Close database connection
    try {
      await db.close();
      console.log('\n📊 Database connection closed');
    } catch (closeError) {
      console.warn('⚠️  Warning: Could not close database connection:', closeError);
    }
  }
}

// Execute if run directly
if (require.main === module) {
  resetAdminPassword().catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

export { resetAdminPassword, validatePassword };