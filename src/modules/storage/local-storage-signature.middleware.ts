import { Injectable, NestMiddleware, ForbiddenException, GoneException, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class LocalStorageSignatureMiddleware implements NestMiddleware {
  private readonly logger = new Logger(LocalStorageSignatureMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    // The request path is like /uploads/development/kyc/userId/uuid.ext
    // We want to extract the key suffix after /uploads/
    const pathPrefix = '/uploads/';
    if (!req.path.startsWith(pathPrefix)) {
      return next();
    }

    const key = req.path.substring(pathPrefix.length).replace(/\\/g, '/');

    const { expires, signature } = req.query;

    if (!expires || !signature) {
      this.logger.warn(`Access denied to ${key}: Missing signature or expiration`);
      throw new ForbiddenException('Access denied: Missing signature or expiration');
    }

    const expiresTimestamp = parseInt(expires as string, 10);
    const nowTimestamp = Math.floor(Date.now() / 1000);

    if (isNaN(expiresTimestamp) || nowTimestamp > expiresTimestamp) {
      this.logger.warn(`Access denied to ${key}: URL has expired`);
      throw new GoneException('Access denied: Signed URL has expired');
    }

    const secret = process.env.JWT_SECRET || 'local-secret';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${key}:${expires}`);
    const expectedSignature = hmac.digest('hex');

    if (signature !== expectedSignature) {
      this.logger.warn(`Access denied to ${key}: Invalid signature`);
      throw new ForbiddenException('Access denied: Invalid signature');
    }

    next();
  }
}
