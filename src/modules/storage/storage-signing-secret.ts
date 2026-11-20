import { randomBytes } from 'crypto';

let developmentSecret: string | undefined;

export function getStorageSigningSecret(): string {
  const secret = process.env.STORAGE_SIGNING_SECRET;
  if (secret?.trim()) {
    return secret;
  }

  if (process.env.NODE_ENV === 'development') {
    developmentSecret ??= randomBytes(32).toString('hex');
    return developmentSecret;
  }

  throw new Error(
    'STORAGE_SIGNING_SECRET must be set unless NODE_ENV is development',
  );
}
