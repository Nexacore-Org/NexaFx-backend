import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { UsersService } from '../../users/users.service';

interface JwtPayload {
  sub: string;
  role: string;
  authStage?: string;
  partial_auth?: boolean;
  isImpersonation?: boolean;
  impersonation?: boolean;
  isSuspended?: boolean;
  isDeleted?: boolean;
  isActive?: boolean;
}

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function parseBasicAuth(
  header: string | undefined,
): { user: string; password: string } | null {
  if (!header?.startsWith('Basic ')) {
    return null;
  }
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator === -1) {
      return null;
    }
    return {
      user: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export function createAdminQueueAuthMiddleware(
  jwtService: JwtService,
  configService: ConfigService,
  usersService?: Pick<UsersService, 'findById'>,
) {
  const initDashboardUser = configService.get<string>('QUEUE_DASHBOARD_USER');
  const initDashboardPassword = configService.get<string>(
    'QUEUE_DASHBOARD_PASSWORD',
  );
  const initJwtSecret = configService.get<string>('JWT_SECRET');

  if (
    !(initDashboardUser && initDashboardPassword) &&
    (!initJwtSecret || initJwtSecret.trim().length === 0)
  ) {
    throw new Error(
      'Queue dashboard requires JWT_SECRET (or QUEUE_DASHBOARD_USER and QUEUE_DASHBOARD_PASSWORD) to be configured',
    );
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    const dashboardUser = configService.get<string>('QUEUE_DASHBOARD_USER');
    const dashboardPassword = configService.get<string>(
      'QUEUE_DASHBOARD_PASSWORD',
    );

    if (dashboardUser && dashboardPassword) {
      const credentials = parseBasicAuth(req.headers.authorization);
      if (
        !credentials ||
        !timingSafeEqual(credentials.user, dashboardUser) ||
        !timingSafeEqual(credentials.password, dashboardPassword)
      ) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Queue Dashboard"');
        res
          .status(401)
          .json({ message: 'Queue dashboard authentication required' });
        return;
      }
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res
        .status(401)
        .json({ message: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.slice(7);
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret || secret.trim().length === 0) {
      res
        .status(503)
        .json({ message: 'Queue dashboard authentication is not configured' });
      return;
    }

    try {
      const payload = await jwtService.verifyAsync<JwtPayload>(token, {
        secret,
      });

      if (
        payload.authStage === 'partial_auth' ||
        payload.partial_auth ||
        payload.isImpersonation ||
        payload.impersonation
      ) {
        res.status(401).json({
          message: 'Partial-auth and impersonation tokens are not allowed',
        });
        return;
      }

      if (
        payload.isDeleted ||
        payload.isActive === false ||
        payload.isSuspended
      ) {
        res
          .status(401)
          .json({ message: 'Admin account is suspended or inactive' });
        return;
      }

      if (usersService) {
        if (!payload.sub) {
          res.status(401).json({ message: 'Invalid token payload' });
          return;
        }
        const user = await usersService.findById(payload.sub);
        if (
          !user ||
          user.isDeleted ||
          user.isActive === false ||
          user.isSuspended
        ) {
          res
            .status(401)
            .json({ message: 'Admin account is suspended or inactive' });
          return;
        }
        if (!ADMIN_ROLES.has(user.role)) {
          res.status(403).json({ message: 'Insufficient permissions' });
          return;
        }
        next();
        return;
      }

      if (!ADMIN_ROLES.has(payload.role)) {
        res.status(403).json({ message: 'Insufficient permissions' });
        return;
      }
      next();
    } catch {
      res.status(401).json({ message: 'Invalid or expired token' });
    }
  };
}
