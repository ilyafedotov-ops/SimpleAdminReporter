# Secure Admin Password Reset Utility

## Overview

This document describes the secure implementation of the admin password reset utilities, which replaces the previous insecure versions that contained hardcoded passwords.

## Security Improvements

### ❌ Previous Vulnerabilities (FIXED)
- **Hardcoded passwords** in source code (`'admin123'`, `'Admin@123!'`)
- **Weak password policies** (no complexity requirements)
- **No audit logging** of password changes
- **Plain text passwords** visible in version control and logs
- **No validation** of password strength

### ✅ Current Security Features

#### 1. **No Hardcoded Credentials**
- Environment variable support: `ADMIN_PASSWORD=your-secure-password`
- Interactive secure password prompting with confirmation
- Memory cleanup after use

#### 2. **Strong Password Validation**
- Minimum 12 characters length
- Requires: lowercase, uppercase, numbers, special characters
- Blocks common weak passwords
- Password strength assessment (weak/medium/strong)

#### 3. **Enhanced Security Configuration**
- Bcrypt rounds increased from 10 to 12
- Secure random salt generation
- Password complexity regex validation
- Memory sanitization

#### 4. **Comprehensive Audit Logging**
- Database audit trail (when `audit_logs` table exists)
- Console logging with timestamps
- Success/failure tracking
- Performance metrics

#### 5. **Transaction Safety**
- Database transactions with rollback capability
- Atomic operations
- Connection pooling and cleanup

## Usage Instructions

### Recommended Method (Environment Variable)
```bash
# Set secure password in environment
export ADMIN_PASSWORD='MySecureP@ssw0rd2024!'

# Execute password reset
npm run reset-admin-password
```

### Interactive Method
```bash
# Will prompt for password securely
npm run reset-admin-password
```

### SQL Generation Only
```bash
# Generate SQL without database execution
npm run reset-admin-password:sql
```

### Dry Run Mode
```bash
# Validate password without making changes
npm run reset-admin-password:dry-run
```

## Password Requirements

### Minimum Requirements
- **Length**: At least 12 characters
- **Complexity**: Must contain:
  - Lowercase letters (a-z)
  - Uppercase letters (A-Z)
  - Numbers (0-9)
  - Special characters (!@#$%^&*()_+-=[]{}|;':\",./<>?)

### Strength Assessment
- **Weak**: Meets minimum requirements
- **Medium**: 14+ characters with good complexity
- **Strong**: 16+ characters with excellent complexity

### Blocked Patterns
Common weak passwords are automatically rejected:
- admin123, Admin@123!, password, Password123!
- administrator, 123456, qwerty, letmein, welcome

## Security Best Practices

### For Administrators
1. **Use strong, unique passwords** (consider password managers)
2. **Clear terminal history** after password operations: `history -c`
3. **Verify password changes** by testing login
4. **Enable 2FA** when available
5. **Regular password rotation** (quarterly recommended)

### For Developers
1. **Never commit passwords** to version control
2. **Use environment variables** for sensitive data
3. **Test in dry-run mode** first
4. **Review audit logs** for suspicious activity
5. **Follow least privilege** principles

## File Security

### File Permissions
```bash
# Secure file permissions for reset scripts
chmod 750 reset-admin-password.js
chmod 750 reset-admin-password.ts
```

### Version Control
- Scripts are safe to commit (no hardcoded passwords)
- `.env` files should remain in `.gitignore`
- Use `.env.example` for documentation

## Audit and Compliance

### Audit Trail
All password reset operations are logged with:
- Timestamp
- Action performed
- Success/failure status
- User details
- Execution metrics
- Error details (if any)

### Log Locations
1. **Database**: `audit_logs` table (if exists)
2. **Console**: Real-time output
3. **Application logs**: Standard logging framework

### Compliance Features
- **SOX**: Audit trail for admin access
- **PCI**: Secure password handling
- **GDPR**: No sensitive data in logs
- **NIST**: Strong authentication requirements

## Troubleshooting

### Common Issues

#### Password Validation Failures
```bash
# Check password meets requirements
npm run reset-admin-password:dry-run
```

#### Database Connection Issues
```bash
# Verify database connectivity
npm run test:db-connection
```

#### Missing Admin User
```bash
# Create admin user first
npm run create-admin
```

#### Audit Log Table Missing
The script will continue without audit logging if the `audit_logs` table doesn't exist.

### Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Password too short" | < 12 characters | Use longer password |
| "Password too common" | Weak pattern | Use unique password |
| "User not found" | Admin user missing | Run create-admin first |
| "Database connection failed" | DB issue | Check connection string |

## Migration from Old Scripts

### If you have the old insecure scripts:
1. **Stop using them immediately**
2. **Use the new secure versions**
3. **Update any automation** to use environment variables
4. **Clear any stored passwords** from old systems

### Verification Steps
1. Test new password with login
2. Check audit logs for the change
3. Verify old passwords no longer work
4. Update documentation/procedures

## Emergency Procedures

### If Password Reset Fails
1. **Check database connectivity**
2. **Verify admin user exists**
3. **Use SQL-only mode** for manual execution
4. **Contact database administrator**

### If Admin Account Locked
1. **Use database direct access**
2. **Reset `failed_login_attempts` to 0**
3. **Clear `locked_until` field**
4. **Reset password using this utility**

## Contact Information

For security issues or questions:
- Security Team: [security@yourcompany.com]
- Database Team: [dba@yourcompany.com]
- Development Team: [dev@yourcompany.com]

---

**Last Updated**: August 2024
**Document Version**: 2.0
**Script Versions**: 
- reset-admin-password.js: secure-v2.0
- reset-admin-password.ts: secure-typescript-v2.0