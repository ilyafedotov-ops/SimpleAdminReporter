# Docker Secrets Configuration

This directory contains sensitive configuration files that should be properly secured in production.

## Security Requirements

⚠️ **CRITICAL**: Never commit actual secret files to git!

## Files Required for Production

Create these files with actual production values:

```bash
# Database connection
echo "postgresql://postgres:SECURE_PASSWORD@postgres:5432/reporting" > database_url.txt

# JWT signing secret (generate with: openssl rand -hex 64)
echo "your-secure-jwt-secret-here" > jwt_secret.txt

# Session secret (generate with: openssl rand -hex 32)
echo "your-secure-session-secret-here" > session_secret.txt

# Database password
echo "your-secure-postgres-password" > postgres_password.txt

# Redis password
echo "your-secure-redis-password" > redis_password.txt

# Active Directory service account password
echo "your-ad-service-account-password" > ad_password.txt

# Azure AD client secret
echo "your-azure-client-secret" > azure_client_secret.txt

# Encryption key for stored credentials (generate with: openssl rand -hex 32)
echo "your-encryption-key-here" > encryption_key.txt
```

## File Permissions

Ensure proper file permissions:
```bash
chmod 600 secrets/*.txt
chown root:root secrets/*.txt  # In production
```

## Production Deployment

For production, consider using:
- **Azure Key Vault** for cloud deployments
- **HashiCorp Vault** for on-premises
- **Docker Swarm secrets** for orchestrated deployments
- **Kubernetes secrets** for K8s deployments

## Development Setup

For development, you can use the template values:
```bash
cp secrets/templates/*.txt secrets/
```

This will use development-safe defaults.