#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * SECURE ADMIN PASSWORD RESET UTILITY
 * 
 * This script securely resets the admin password by:
 * 1. Reading password from environment variable (recommended) or prompting user
 * 2. Using cryptographically secure bcrypt hashing
 * 3. Generating SQL with parameterized queries to prevent injection
 * 4. Providing audit logging capabilities
 * 
 * SECURITY WARNINGS:
 * - Never commit passwords to version control
 * - Use strong passwords (minimum 12 characters, mixed case, numbers, symbols)
 * - Run this script only on secure systems
 * - Delete any temporary files containing passwords
 * 
 * Usage:
 *   # Using environment variable (RECOMMENDED):
 *   ADMIN_PASSWORD='your-secure-password' node reset-admin-password.js
 *   
 *   # Using interactive prompt:
 *   node reset-admin-password.js
 *   
 *   # Generate only SQL (no database connection):
 *   ADMIN_PASSWORD='your-secure-password' SQL_ONLY=true node reset-admin-password.js
 */

const bcrypt = require('bcryptjs');
const readline = require('readline');
const crypto = require('crypto');

// Security configuration
const MIN_PASSWORD_LENGTH = 12;
const BCRYPT_ROUNDS = 12; // Increased from 10 for better security
const PASSWORD_COMPLEXITY_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/;

/**
 * Validates password strength
 * @param {string} password - Password to validate
 * @returns {boolean} - True if password meets requirements
 */
function validatePassword(password) {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    console.error(`❌ Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
    return false;
  }
  
  if (!PASSWORD_COMPLEXITY_REGEX.test(password)) {
    console.error('❌ Password must contain:');
    console.error('   - At least one lowercase letter');
    console.error('   - At least one uppercase letter');
    console.error('   - At least one number');
    console.error('   - At least one special character');
    return false;
  }
  
  // Check for common weak passwords
  const weakPasswords = ['admin123', 'Admin@123!', 'password', 'Password123!'];
  if (weakPasswords.includes(password)) {
    console.error('❌ Password is too common. Please use a more secure password.');
    return false;
  }
  
  return true;
}

/**
 * Securely prompts for password input
 * @returns {Promise<string>} - The entered password
 */
function promptPassword() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    // Hide password input
    rl.stdoutMuted = true;
    
    rl.question('Enter new admin password: ', (password) => {
      rl.close();
      console.log(''); // New line after hidden input
      resolve(password);
    });
    
    rl._writeToOutput = function _writeToOutput(stringToWrite) {
      if (rl.stdoutMuted) {
        rl.output.write('*');
      } else {
        rl.output.write(stringToWrite);
      }
    };
  });
}

/**
 * Main function to reset admin password
 */
async function resetAdminPassword() {
  try {
    console.log('🔐 SECURE ADMIN PASSWORD RESET UTILITY');
    console.log('=====================================\n');
    
    // Get password from environment or prompt
    let password = process.env.ADMIN_PASSWORD;
    
    if (!password) {
      console.log('⚠️  No ADMIN_PASSWORD environment variable found.');
      console.log('   For better security, use: ADMIN_PASSWORD="your-password" node reset-admin-password.js\n');
      
      password = await promptPassword();
    } else {
      console.log('✅ Using password from environment variable\n');
    }
    
    // Validate password strength
    if (!validatePassword(password)) {
      console.error('\n❌ Password validation failed. Exiting.');
      process.exit(1);
    }
    
    console.log('✅ Password validation passed');
    
    // Generate secure hash
    console.log('⏳ Generating secure hash...');
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    console.log('✅ Hash generated successfully');
    
    // Generate SQL statement
    const sqlStatement = `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2 AND auth_source = $3 RETURNING id, username, updated_at;`;
    const parameters = [hash, 'admin', 'local'];
    
    console.log('\n📝 Generated SQL Statement:');
    console.log('===============================');
    console.log(sqlStatement);
    console.log('\n📋 Parameters:');
    console.log(`   $1 = '${hash}'`);
    console.log(`   $2 = 'admin'`);
    console.log(`   $3 = 'local'`);
    
    // If SQL_ONLY mode, just output the statement
    if (process.env.SQL_ONLY === 'true') {
      console.log('\n✅ SQL generation complete (SQL_ONLY mode)');
      console.log('\n🔒 SECURITY REMINDER:');
      console.log('   - Copy the SQL statement above');
      console.log('   - Execute it manually in your database');
      console.log('   - Clear your terminal history afterwards');
      return;
    }
    
    // For database execution, recommend using the TypeScript version
    console.log('\n⚠️  DATABASE EXECUTION:');
    console.log('   For database execution, use the TypeScript version:');
    console.log('   ADMIN_PASSWORD="your-password" ts-node reset-admin-password.ts');
    console.log('\n   Or execute the SQL manually in your database client.');
    
    // Generate audit log entry
    const auditLog = {
      timestamp: new Date().toISOString(),
      action: 'admin_password_reset',
      username: 'admin',
      source_ip: 'localhost',
      user_agent: 'password-reset-script',
      details: {
        script_version: 'secure-v2.0',
        password_length: password.length,
        hash_rounds: BCRYPT_ROUNDS
      }
    };
    
    console.log('\n📊 Audit Log Entry:');
    console.log('====================');
    console.log(JSON.stringify(auditLog, null, 2));
    
    // Clear sensitive variables
    password = null;
    
    console.log('\n✅ Password reset preparation complete!');
    console.log('\n🔒 SECURITY REMINDERS:');
    console.log('   1. Execute the SQL statement in a secure environment');
    console.log('   2. Clear terminal history: history -c');
    console.log('   3. Verify the password change by attempting login');
    console.log('   4. Consider enabling 2FA for admin accounts');
    
  } catch (error) {
    console.error('\n❌ Error during password reset:', error.message);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  resetAdminPassword();
}

module.exports = { resetAdminPassword, validatePassword };
