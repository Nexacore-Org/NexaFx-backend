import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class AdminQueueAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AdminQueueAuthMiddleware.name);

  constructor(private readonly configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const expectedUser =
      this.configService.get<string>('QUEUE_DASHBOARD_USER') ||
      process.env.QUEUE_DASHBOARD_USER;
    const expectedPassword =
      this.configService.get<string>('QUEUE_DASHBOARD_PASSWORD') ||
      process.env.QUEUE_DASHBOARD_PASSWORD;

    // Reject if dashboard credentials are not configured in the environment (never be silently permissive)
    if (!expectedUser || !expectedPassword) {
      this.logger.error(
        'Queue dashboard credentials (QUEUE_DASHBOARD_USER / QUEUE_DASHBOARD_PASSWORD) are not configured.',
      );
      res.setHeader('WWW-Authenticate', 'Basic realm="Queue Dashboard"');
      throw new UnauthorizedException(
        'Queue dashboard authentication is not configured on this server.',
      );
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="Queue Dashboard"');
      throw new UnauthorizedException('Authentication required for Queue Dashboard');
    }

    try {
      const base64Credentials = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
      const [username, password] = credentials.split(':');

      if (username !== expectedUser || password !== expectedPassword) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Queue Dashboard"');
        throw new UnauthorizedException('Invalid Queue Dashboard credentials');
      }

      return next();
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      res.setHeader('WWW-Authenticate', 'Basic realm="Queue Dashboard"');
      throw new UnauthorizedException('Malformed authorization header');
    }
  }
}
