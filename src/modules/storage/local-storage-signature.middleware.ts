import {
  Injectable,
  NestMiddleware,
  ForbiddenException,
  GoneException,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import * as path from 'path';
import { getStorageSigningSecret } from './storage.service';

@Injectable()
export class LocalStorageSignatureMiddleware implements NestMiddleware {
  private readonly logger = new Logger(LocalStorageSignatureMiddleware.name);
  private readonly uploadsBase = path.resolve(process.cwd(), 'uploads');

  use(req: Request, res: Response, next: NextFunction) {
    // The request path is like /uploads/development/kyc/userId/uuid.ext
    // We want to extract the key suffix after /uploads/
    const pathPrefix = '/uploads/';
    if (!req.path.startsWith(pathPrefix)) {
      return next();
    }

    const rawKey = req.path.substring(pathPrefix.length).replace(/\\/g, '/');
    const resolvedBase = path.resolve(this.uploadsBase);
    const resolvedTarget = path.resolve(resolvedBase, rawKey);
    const relative = path.relative(resolvedBase, resolvedTarget);

    if (
      !relative ||
      relative.startsWith('..') ||
      path.isAbsolute(relative) ||
      !resolvedTarget.startsWith(resolvedBase + path.sep)
    ) {
      this.logger.warn(`Access denied to ${rawKey}: Path traversal detected`);
      throw new ForbiddenException('Access denied: Invalid file path');
    }

    const key = relative.replace(/\\/g, '/');

    const { expires, signature } = req.query;

    if (!expires || !signature || typeof signature !== 'string') {
      this.logger.warn(
        `Access denied to ${key}: Missing signature or expiration`,
      );
      throw new ForbiddenException(
        'Access denied: Missing signature or expiration',
      );
    }

    const expiresTimestamp = parseInt(expires as string, 10);
    const nowTimestamp = Math.floor(Date.now() / 1000);

    if (isNaN(expiresTimestamp) || nowTimestamp > expiresTimestamp) {
      this.logger.warn(`Access denied to ${key}: URL has expired`);
      throw new GoneException('Access denied: Signed URL has expired');
    }

    const secret = getStorageSigningSecret();
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${key}:${expires}`);
    const expectedSignature = hmac.digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const providedBuffer = Buffer.from(signature, 'utf8');

    if (
      expectedBuffer.length !== providedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      this.logger.warn(`Access denied to ${key}: Invalid signature`);
      throw new ForbiddenException('Access denied: Invalid signature');
    }

    if (typeof res.setHeader === 'function') {
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }

    next();
  }
}
