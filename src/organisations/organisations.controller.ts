import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { OrganisationsService } from './organisations.service';
import { CreateOrganisationDto } from './dto/create-organisation.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';

@ApiTags('Organisations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('v2/organisations')
export class OrganisationsController {
  constructor(private readonly orgsService: OrganisationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new organisation' })
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateOrganisationDto,
  ) {
    return this.orgsService.createOrganisation(user.userId, dto);
  }

  @Get('me')
  @ApiOperation({ summary: "List organisations the current user belongs to" })
  listMine(@CurrentUser() user: CurrentUserPayload) {
    return this.orgsService.getUserOrganisations(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organisation details' })
  @ApiParam({ name: 'id', type: String })
  get(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.orgsService.getOrganisationById(id, user.userId);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List members of an organisation' })
  @ApiParam({ name: 'id', type: String })
  listMembers(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.orgsService.listMembers(id, user.userId);
  }

  @Post(':id/members/invite')
  @ApiOperation({ summary: 'Invite a user to the organisation (OWNER/ADMIN)' })
  @ApiParam({ name: 'id', type: String })
  invite(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: InviteMemberDto,
  ) {
    return this.orgsService.inviteMember(id, user.userId, dto);
  }

  @Post(':id/members/accept-invite')
  @ApiOperation({ summary: 'Accept a pending membership invite' })
  @ApiParam({ name: 'id', type: String })
  acceptInvite(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: AcceptInviteDto,
  ) {
    return this.orgsService.acceptInvite(dto.token, user.userId);
  }

  @Patch(':id/members/:memberId')
  @ApiOperation({ summary: 'Update a member role (OWNER/ADMIN)' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'memberId', type: String })
  updateRole(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.orgsService.updateMemberRole(id, user.userId, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  @ApiOperation({ summary: 'Remove a member from the organisation (OWNER/ADMIN)' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'memberId', type: String })
  removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.orgsService.removeMember(id, user.userId, memberId);
  }
}
