# Database Backup Automation

Automated daily PostgreSQL backups using GitHub Actions. Backups are compressed, AES-256-CBC encrypted, uploaded to S3, retained for 30 days, and verified weekly via restore testing.

## Workflows

| Workflow | Schedule | Description |
|----------|----------|-------------|
| `db-backup.yml` | Daily at 02:00 UTC | `pg_dump` → gzip → encrypt → upload to S3 |
| `db-backup-retention.yml` | Weekly Sunday 03:00 UTC | Delete backups older than 30 days |
| `db-restore-verify.yml` | Weekly Sunday 04:00 UTC | Restore latest backup to temp DB and sanity-check |

All three workflows can also be triggered manually via `workflow_dispatch` from the GitHub Actions tab.

## Required GitHub Secrets

Set these secrets in your GitHub repository: **Settings → Secrets and variables → Actions**.

| Secret | Description | Example |
|--------|-------------|---------|
| `DATABASE_URL` | Production PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `BACKUP_ENCRYPTION_KEY` | AES-256 key for encrypting backup archives | Generate: `openssl rand -hex 32` |
| `AWS_ACCESS_KEY_ID` | AWS IAM access key for S3 uploads | `AKIAIOSFODNN7EXAMPLE` |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret key | `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` |
| `AWS_REGION` | AWS region of the S3 bucket | `us-east-1` |
| `BACKUP_BUCKET` | S3 bucket name for backup storage | `nexafx-backups` |
| `BACKUP_ALERT_WEBHOOK` | Slack/email webhook for failure alerts | `https://hooks.slack.com/...` |

### S3 Bucket Policy

The IAM user associated with `AWS_ACCESS_KEY_ID` needs these permissions on the backup bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::nexafx-backups",
        "arn:aws:s3:::nexafx-backups/*"
      ]
    }
  ]
}
```

## S3 Object Layout

```
s3://<bucket>/
├── nexafx/
│   ├── 2026/
│   │   ├── 06/
│   │   │   ├── 24/
│   │   │   │   └── backup-20260624-020015.dump.gz.enc
│   │   │   ├── 25/
│   │   │   │   └── backup-20260625-020015.dump.gz.enc
│   │   │   └── ...
│   │   └── ...
│   └── manifests/
│       ├── backup-20260624-020015.manifest.json
│       ├── backup-20260625-020015.manifest.json
│       └── ...
```

### Manifest format

```json
{
  "filename": "backup-20260624-020015.dump.gz.enc",
  "size": 10485760,
  "checksum": "sha256hexhash...",
  "createdAt": "2026-06-24T02:00:15Z",
  "pgVersion": "pg_dump (PostgreSQL) 15.4"
}
```

## Encryption Details

- **Algorithm:** AES-256-CBC with PBKDF2 key derivation
- **Tool:** OpenSSL (`openssl enc -aes-256-cbc -pbkdf2`)
- **Key:** 64-character hex string from `BACKUP_ENCRYPTION_KEY`
- **Raw dump file deleted from runner immediately after encryption**

To manually decrypt a backup:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 \
  -in backup.dump.gz.enc \
  -out backup.dump.gz \
  -k "$BACKUP_ENCRYPTION_KEY"
gunzip backup.dump.gz
pg_restore -d your_db backup.dump
```

## Restore Verification

The `db-restore-verify.yml` workflow:
1. Finds the latest manifest in S3
2. Downloads the corresponding encrypted backup
3. Decrypts and decompresses
4. Starts a temporary PostgreSQL 15 container (port 5433 — isolated from production)
5. Runs `pg_restore` into the temp database
6. Executes `SELECT COUNT(*) FROM users` — must return > 0
7. Tears down the container
8. Reports results as a GitHub Actions workflow summary

## Admin Endpoint

`GET /admin/backups` — lists the last 10 backup manifests from S3.

```json
[
  {
    "filename": "backup-20260624-020015.dump.gz.enc",
    "size": 10485760,
    "checksum": "sha256hexhash...",
    "createdAt": "2026-06-24T02:00:15Z",
    "pgVersion": "pg_dump (PostgreSQL) 15.4",
    "s3Key": "nexafx/manifests/backup-20260624-020015.manifest.json"
  }
]
```

Requires `ADMIN` role with JWT bearer token.

## Failure Alerts

When any backup workflow fails, a notification is sent to the `BACKUP_ALERT_WEBHOOK` URL. This is formatted as a Slack-compatible webhook payload but can point to any service that accepts JSON POST requests.

## Testing

To verify the backup pipeline end-to-end:

1. Set `DATABASE_URL` to a staging/development database
2. Run the workflow manually: **Actions → Database Backup → Run workflow**
3. Check the S3 bucket for the uploaded encrypted file and manifest
4. Run **DB Restore Verification** to confirm the backup is restorable
5. Optionally break `DATABASE_URL` temporarily to test failure alerts
