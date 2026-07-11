# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| main    | yes       |

## Reporting a Vulnerability

If you discover a security issue, please report it privately:

1. Do not open a public GitHub issue for exploitable vulnerabilities.
2. Contact the maintainers privately with a description, reproduction steps, and impact assessment.
3. Allow up to 5 business days for an initial response.

## Security Practices

- Secrets must be provided via environment variables or Docker `*_FILE` mounts in production.
- Azure and Microsoft 365 authentication must use OAuth2/OIDC with PKCE; password-based cloud login is not supported.
- Administrative endpoints require `isAdmin` authorization.
- Audit and system logs are restricted to administrators.
- Production deployments must set strong values for `JWT_SECRET`, `SESSION_SECRET`, `COOKIE_SECRET`, and `CREDENTIAL_ENCRYPTION_KEY`.

## Threat Model Summary

Primary assets:

- Active Directory and Microsoft 365 directory data
- Stored service credentials
- Audit and operational logs
- Generated report exports

Primary threats:

- Authenticated privilege escalation
- Credential theft via XSS or log exposure
- Unauthorized report or export access
- Weak default secrets in containerized deployments

Mitigations implemented in this repository include encrypted credential storage, admin-scoped log access, query table allowlists, secret file loading, and CI secret scanning.
