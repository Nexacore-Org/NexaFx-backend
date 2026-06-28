import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface JwtPayload { sub: string; role: string; }
const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

export function createAdminQueueAuthMiddleware(
  jwtService: JwtService,
  configService: ConfigService,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
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