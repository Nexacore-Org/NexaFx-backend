import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class MockJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true;
  }
}

@Injectable()
export class MockRolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return true; // Always allow "admin"
  }
}
