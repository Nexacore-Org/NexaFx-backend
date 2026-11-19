import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { UserRole } from '../../users/user.entity';
import { PlatformConfig } from '../entities/platform-config.entity';

@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(
    private readonly dataSource: DataSource,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const config = await this.dataSource
      .getRepository(PlatformConfig)
      .findOne({ where: { key: 'maintenanceMode' } });

    if (!this.isMaintenanceEnabled(config?.value)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      path?: string;
      user?: { role?: UserRole };
    }>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (
      isPublic ||
      request.path?.startsWith('/health') ||
      request.path?.startsWith('/super-admin') ||
      request.user?.role === UserRole.SUPER_ADMIN
    ) {
      return true;
    }

    throw new ServiceUnavailableException(
      'Service is temporarily unavailable for maintenance',
    );
  }

  private isMaintenanceEnabled(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (value && typeof value === 'object') {
      return Boolean(
        (value as Record<string, unknown>).maintenanceMode ??
          (value as Record<string, unknown>).enabled,
      );
    }

    return false;
  }
}
