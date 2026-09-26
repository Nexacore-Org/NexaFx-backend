import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface JwtPayload { sub: string; role: string; }
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

function parseBasicAuth(header: string | undefined): { user: string; password: string } | null {
  if (!header?.startsWith('Basic ')) {
    return null;
  }
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator === -1) {
      return null;
    }
    return { user: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

export function createAdminQueueAuthMiddleware(
  jwtService: JwtService,
  configService: ConfigService,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const dashboardUser = configService.get<string>('QUEUE_DASHBOARD_USER');
    const dashboardPassword = configService.get<string>('QUEUE_DASHBOARD_PASSWORD');

    if (dashboardUser && dashboardPassword) {
      const credentials = parseBasicAuth(req.headers.authorization);
      if (
        !credentials ||
        !timingSafeEqual(credentials.user, dashboardUser) ||
        !timingSafeEqual(credentials.password, dashboardPassword)
      ) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Queue Dashboard"');
        res.status(401).json({ message: 'Queue dashboard authentication required' });
        return;
      }
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ message: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.slice(7);
    const secret = configService.get<string>('JWT_SECRET') ?? 'dev-access-secret';

    try {
      const payload = await jwtService.verifyAsync<JwtPayload>(token, { secret });
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