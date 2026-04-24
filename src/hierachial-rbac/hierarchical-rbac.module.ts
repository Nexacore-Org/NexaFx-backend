import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RbacAdminController } from './rbac-admin.controller';
import { RbacAdminService } from './rbac-admin.service';
import { Role } from './entities/role.entity';
import { UserRoleAssignment } from './entities/user-role.entity';
import { RbacAuditLog } from './entities/rbac-audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Role, UserRoleAssignment, RbacAuditLog]),
  ],
  controllers: [RbacAdminController],
  providers: [RbacAdminService],
  exports: [RbacAdminService],
})
export class HierarchicalRbacModule {}
