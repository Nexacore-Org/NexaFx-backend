import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Role } from './entities/role.entity';
import { UserRoleAssignment } from './entities/user-role.entity';
import { RbacAuditLog } from './entities/rbac-audit-log.entity';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';

@Injectable()
export class RbacAdminService {
  private readonly logger = new Logger(RbacAdminService.name);

  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(UserRoleAssignment)
    private readonly userRoleRepository: Repository<UserRoleAssignment>,
    @InjectRepository(RbacAuditLog)
    private readonly rbacAuditLogRepository: Repository<RbacAuditLog>,
  ) {}

  /**
   * Get all roles with inheritance chain
   */
  async getAllRoles(): Promise<Role[]> {
    const roles = await this.roleRepository.find({
      order: { name: 'ASC' },
    });

    // Build inheritance chain for each role
    const rolesWithChain = await Promise.all(
      roles.map(async (role) => {
        const inheritanceChain = await this.getInheritanceChain(role.id);
        return {
          ...role,
          inheritanceChain,
        };
      }),
    );

    return rolesWithChain;
  }

  /**
   * Create a new role with circular inheritance validation
   */
  async createRole(dto: CreateRoleDto, actorId: string): Promise<Role> {
    // Check if role name already exists
    const existing = await this.roleRepository.findOne({
      where: { name: dto.name },
    });

    if (existing) {
      throw new BadRequestException(`Role "${dto.name}" already exists`);
    }

    // Validate no circular inheritance
    if (dto.parentRoleId) {
      const wouldCreateCircular = await this.wouldCreateCircular(
        null, // New role, no ID yet
        dto.parentRoleId,
      );

      if (wouldCreateCircular) {
        throw new BadRequestException(
          'Creating this role would create circular inheritance',
        );
      }
    }

    const role = this.roleRepository.create({
      name: dto.name,
      description: dto.description,
      parentRoleId: dto.parentRoleId || null,
      permissions: dto.permissions || [],
    });

    const saved = await this.roleRepository.save(role);

    // Audit log
    await this.logAudit('ROLE_CREATED', saved.id, actorId, {
      name: saved.name,
      parentRoleId: saved.parentRoleId,
      permissions: saved.permissions,
    });

    this.logger.log(`Role "${saved.name}" created by admin ${actorId}`);
    return saved;
  }

  /**
   * Update role with inheritance revalidation
   */
  async updateRole(
    id: string,
    dto: UpdateRoleDto,
    actorId: string,
  ): Promise<Role> {
    const role = await this.roleRepository.findOne({ where: { id } });

    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    const oldValues = { ...role };

    // Validate circular inheritance if parent changed
    if (dto.parentRoleId && dto.parentRoleId !== role.parentRoleId) {
      const wouldCreateCircular = await this.wouldCreateCircular(
        id,
        dto.parentRoleId,
      );

      if (wouldCreateCircular) {
        throw new BadRequestException(
          'Updating this role would create circular inheritance',
        );
      }
    }

    // Update fields
    if (dto.name !== undefined) {
      // Check uniqueness if name changed
      if (dto.name !== role.name) {
        const existing = await this.roleRepository.findOne({
          where: { name: dto.name },
        });
        if (existing) {
          throw new BadRequestException(`Role "${dto.name}" already exists`);
        }
      }
      role.name = dto.name;
    }

    if (dto.description !== undefined) {
      role.description = dto.description;
    }

    if (dto.parentRoleId !== undefined) {
      role.parentRoleId = dto.parentRoleId;
    }

    if (dto.permissions !== undefined) {
      role.permissions = dto.permissions;
    }

    const saved = await this.roleRepository.save(role);

    // Audit log
    await this.logAudit('ROLE_UPDATED', saved.id, actorId, {
      oldValues,
      newValues: {
        name: saved.name,
        description: saved.description,
        parentRoleId: saved.parentRoleId,
        permissions: saved.permissions,
      },
    });

    this.logger.log(`Role "${saved.name}" updated by admin ${actorId}`);
    return saved;
  }

  /**
   * Delete role and cascade to user assignments
   */
  async deleteRole(id: string, actorId: string): Promise<void> {
    const role = await this.roleRepository.findOne({
      where: { id },
      relations: ['childRoles'],
    });

    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    // Remove all user-role assignments for this role
    const assignments = await this.userRoleRepository.find({
      where: { roleId: id },
    });

    if (assignments.length > 0) {
      await this.userRoleRepository.remove(assignments);
      this.logger.log(
        `Removed ${assignments.length} user assignments for role "${role.name}"`,
      );
    }

    // Set child roles' parentRoleId to null
    if (role.childRoles && role.childRoles.length > 0) {
      await this.roleRepository.update(
        { parentRoleId: id },
        { parentRoleId: null },
      );
      this.logger.log(
        `Detached ${role.childRoles.length} child roles from "${role.name}"`,
      );
    }

    // Delete the role
    await this.roleRepository.delete(id);

    // Audit log
    await this.logAudit('ROLE_DELETED', id, actorId, {
      roleName: role.name,
      removedAssignments: assignments.length,
      detachedChildren: role.childRoles?.length || 0,
    });

    this.logger.log(`Role "${role.name}" deleted by admin ${actorId}`);
  }

  /**
   * Get fully resolved permission set for a user
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    // Get all roles assigned to user
    const assignments = await this.userRoleRepository.find({
      where: { userId },
      relations: ['role'],
    });

    const roleIds = assignments.map((a) => a.roleId);

    if (roleIds.length === 0) {
      return [];
    }

    // Resolve all permissions including inherited
    const allPermissions = new Set<string>();

    for (const roleId of roleIds) {
      const permissions = await this.resolveRolePermissions(roleId);
      permissions.forEach((p) => allPermissions.add(p));
    }

    return Array.from(allPermissions);
  }

  /**
   * Preview permission change without applying
   */
  async previewRoleDiff(
    roleId: string,
    newParentId: string | null,
  ): Promise<{ added: string[]; removed: string[] }> {
    const role = await this.roleRepository.findOne({ where: { id: roleId } });

    if (!role) {
      throw new NotFoundException(`Role with ID ${roleId} not found`);
    }

    // Get current resolved permissions
    const currentPermissions = await this.resolveRolePermissions(roleId);

    // Get hypothetical permissions with new parent
    const hypotheticalPermissions = await this.resolveRolePermissions(
      roleId,
      newParentId,
    );

    // Calculate diff
    const added = hypotheticalPermissions.filter(
      (p) => !currentPermissions.includes(p),
    );
    const removed = currentPermissions.filter(
      (p) => !hypotheticalPermissions.includes(p),
    );

    return { added, removed };
  }

  /**
   * Get RBAC audit logs
   */
  async getAuditLogs(filters?: {
    action?: string;
    roleId?: string;
    actorId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ logs: RbacAuditLog[]; total: number }> {
    const {
      action,
      roleId,
      actorId,
      page = 1,
      limit = 20,
    } = filters || {};

    const where: any = {};
    if (action) where.action = action;
    if (roleId) where.roleId = roleId;
    if (actorId) where.actorId = actorId;

    const [logs, total] = await this.rbacAuditLogRepository.findAndCount({
      where,
      order: { timestamp: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { logs, total };
  }

  /**
   * Check if setting parentRoleId would create circular inheritance
   */
  private async wouldCreateCircular(
    roleId: string | null,
    newParentId: string,
  ): Promise<boolean> {
    // DFS from newParentId to see if we can reach roleId
    const visited = new Set<string>();
    const stack: string[] = [newParentId];

    while (stack.length > 0) {
      const currentId = stack.pop();

      if (!currentId) continue;

      if (currentId === roleId) {
        return true;
      }

      if (visited.has(currentId)) {
        continue;
      }

      visited.add(currentId);

      // Get children of current role
      const children = await this.roleRepository.find({
        where: { parentRoleId: currentId },
      });

      stack.push(...children.map((c) => c.id));
    }

    return false;
  }

  /**
   * Resolve all permissions for a role including inherited from parents
   */
  private async resolveRolePermissions(
    roleId: string,
    hypotheticalParentId?: string | null,
  ): Promise<string[]> {
    const allPermissions = new Set<string>();
    const visited = new Set<string>();
    const stack: string[] = [roleId];

    // If hypothetical parent is provided, we need to handle it differently
    let hypotheticalParentProcessed = false;

    while (stack.length > 0) {
      const currentId = stack.pop();

      if (!currentId) continue;

      if (visited.has(currentId)) {
        continue;
      }

      visited.add(currentId);

      const role = await this.roleRepository.findOne({
        where: { id: currentId },
      });

      if (!role) {
        continue;
      }

      // Add role's permissions
      role.permissions.forEach((p) => allPermissions.add(p));

      // Add parent to stack
      if (role.parentRoleId) {
        stack.push(role.parentRoleId);
      }

      // Handle hypothetical parent (only for the initial role)
      if (
        currentId === roleId &&
        hypotheticalParentId !== undefined &&
        !hypotheticalParentProcessed
      ) {
        hypotheticalParentProcessed = true;
        if (hypotheticalParentId) {
          stack.push(hypotheticalParentId);
        }
      }
    }

    return Array.from(allPermissions);
  }

  /**
   * Get inheritance chain for a role (from root to current)
   */
  private async getInheritanceChain(roleId: string): Promise<string[]> {
    const chain: string[] = [];
    let currentId: string | null = roleId;

    while (currentId) {
      const role = await this.roleRepository.findOne({
        where: { id: currentId },
      });

      if (!role) {
        break;
      }

      chain.unshift(role.name);
      currentId = role.parentRoleId;
    }

    return chain;
  }

  /**
   * Log RBAC audit event
   */
  private async logAudit(
    action: string,
    roleId: string | null,
    actorId: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      await this.rbacAuditLogRepository.save({
        action,
        roleId,
        actorId,
        metadata,
      });
    } catch (error) {
      this.logger.error(`Failed to log RBAC audit: ${error.message}`);
    }
  }
}
