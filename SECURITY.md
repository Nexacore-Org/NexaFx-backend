# Security Policy

## Supported Versions

We actively support the following versions of NexaFX:

| Version | Supported          |
| ------- | ------------------ |
| 2.x.x   | :white_check_mark: |
| 1.x.x   | :white_check_mark: (critical fixes only) |

---

## Reporting a Vulnerability

If you discover a security vulnerability in NexaFX, **do NOT open a public GitHub issue**. Publicly disclosing a vulnerability can put all users at risk.

### How to Report

1. **Email us**: Send a detailed report to `security@nexacore.org`
2. **Include details**:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Any proof of concept or exploit code (if available)
3. **Response time**: We will acknowledge your report within **48 hours**

### What to Expect

1. **Acknowledgment**: We will confirm receipt of your report within 48 hours
2. **Investigation**: Our security team will investigate and validate the vulnerability
3. **Fix development**: We will develop a fix for confirmed vulnerabilities
4. **Disclosure coordination**: We will work with you to coordinate public disclosure (if applicable)
5. **Credit**: We will credit you for the discovery in our release notes (if you wish)

### What NOT to Do

- **Do NOT** disclose the vulnerability publicly before a fix is released
- **Do NOT** exploit the vulnerability for any purpose
- **Do NOT** access or modify user data without explicit permission
- **Do NOT** use automated scanners without prior approval
- **Do NOT** cause denial of service or disruption to our services

---

## Security Best Practices

For developers contributing to NexaFX:

- **Never commit secrets**: API keys, passwords, private keys, etc.
- **Use environment variables**: Store sensitive configuration in env vars
- **Follow least privilege**: Grant only the permissions necessary
- **Validate all inputs**: Prevent injection attacks
- **Use HTTPS everywhere**: Encrypt all data in transit
- **Keep dependencies updated**: Regularly run `npm audit`
- **Write secure tests**: Include security-related test cases

---

## Security Features

NexaFX includes the following security features:

- JWT-based authentication and authorization
- Role-based access control (RBAC)
- Password hashing with bcrypt
- Two-factor authentication (2FA)
- Input validation and sanitization
- Rate limiting to prevent abuse
- Audit logging of all critical operations
- Database encryption at rest
- TLS for all API communications

---

## Contact

For any security-related questions or concerns, please contact us at `security@nexacore.org`.
