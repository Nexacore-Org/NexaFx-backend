import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrgRole } from '../entities/organisation-member.entity';

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: [OrgRole.ADMIN, OrgRole.MEMBER] })
  @IsEnum([OrgRole.ADMIN, OrgRole.MEMBER])
  role: OrgRole.ADMIN | OrgRole.MEMBER;
}
