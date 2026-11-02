import { BadRequestException } from '@nestjs/common';
import { fromBuffer } from 'file-type';

export const STORAGE_SERVICE_TOKEN = 'StorageService';

export const ALLOWED_STORAGE_MIME_TYPES: Readonly<Record<string, string>> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

export const DEV_FALLBACK_STORAGE_SIGNING_SECRET =
  'dev-only-storage-signing-secret';

export interface StorageService {
  upload(file: Express.Multer.File, path: string): Promise<string>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

/**
 * Resolve the dedicated signing secret for local storage URLs.
 * Fails closed outside development when STORAGE_SIGNING_SECRET is not configured.
 */
export function getStorageSigningSecret(): string {
  const secret = process.env.STORAGE_SIGNING_SECRET?.trim();
  if (secret) {
    return secret;
  }

  const env = process.env.NODE_ENV || 'development';
  if (env !== 'development') {
    throw new Error(
      'STORAGE_SIGNING_SECRET must be set outside development environment',
    );
  }

  return DEV_FALLBACK_STORAGE_SIGNING_SECRET;
}

/**
 * Derive the canonical MIME type and file extension from server-validated
 * file content and the strict allow-list map, never from file.originalname
 * or an unvalidated client mimetype.
 */
export async function resolveValidatedStorageType(
  file: Express.Multer.File,
): Promise<{ mimeType: string; extension: string }> {
  if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
    throw new BadRequestException('Invalid or empty file buffer');
  }

  const detected = await fromBuffer(file.buffer);
  if (detected?.mime) {
    const extension = ALLOWED_STORAGE_MIME_TYPES[detected.mime];
    if (!extension) {
      throw new BadRequestException(
        `Unsupported file MIME type: ${detected.mime}`,
      );
    }
    return { mimeType: detected.mime, extension };
  }

  const snippet = file.buffer
    .subarray(0, Math.min(file.buffer.length, 512))
    .toString('utf8')
    .trimStart()
    .toLowerCase();

  if (
    snippet.startsWith('<') ||
    snippet.includes('<html') ||
    snippet.includes('<svg') ||
    snippet.includes('<script')
  ) {
    throw new BadRequestException('Unsupported or unsafe file content');
  }

  const normalizedMime = file.mimetype?.toLowerCase().trim();
  if (normalizedMime && ALLOWED_STORAGE_MIME_TYPES[normalizedMime]) {
    return {
      mimeType: normalizedMime,
      extension: ALLOWED_STORAGE_MIME_TYPES[normalizedMime],
    };
  }

  throw new BadRequestException(
    `Unsupported file MIME type: ${file.mimetype || 'unknown'}`,
  );
}
