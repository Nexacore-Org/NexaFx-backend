# NexaFX Backend v2

A minimal NestJS v2 foundation for the NexaFX backend.

## Local Setup

```bash
npm install
cp .env.example .env
npm run start:dev
```

## Environment Variables

- `NODE_ENV` — runtime environment. Allowed values: `development`, `staging`, `production`, `test`.
- `PORT` — application port, default `3000`.
- `DATABASE_URL` — PostgreSQL connection string.
- `JWT_SECRET` — JWT signing secret, minimum 32 characters.
- `JWT_EXPIRES_IN` — JWT expiration time, e.g. `15m`, `1h`, `7d`.
- `ALLOWED_ORIGINS` — comma-separated allowed CORS origins.

## Health Check

- `GET /`
- `GET /health`
