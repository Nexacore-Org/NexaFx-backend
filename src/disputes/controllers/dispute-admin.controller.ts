import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { DisputesService } from '../disputes.service';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../users/user.entity';
import { AssignDisputeDto } from '../dto/assign-dispute.dto';
import { ResolveDisputeDto } from '../dto/resolve-dispute.dto';
import { AddEvidenceDto } from '../dto/add-evidence.dto';
import { DisputeQueryDto } from '../dto/dispute-query.dto';

@ApiTags('Admin – Disputes')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin/disputes')
export class DisputeAdminController {
  constructor(private readonly disputesService: DisputesService) {}

  /**
   * GET /admin/disputes
   * List all disputes with optional status/reason filters.
   */
  @Get()
  @ApiOperation({ summary: 'Admin: list all disputes with filters' })
  @ApiResponse({ status: 200, description: 'Paginated list of disputes' })
  async listAll(@Query() query: DisputeQueryDto) {
    return this.disputesService.listAllDisputes(query);
  }

  /**
   * GET /admin/disputes/:id
   * Full evidence view (all sides, including unreleased respondent evidence).
   */
  @Get(':id')
  @ApiOperation({ summary: 'Admin: get full dispute details and all evidence' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiResponse({ status: 200, description: 'Full dispute with all evidence' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async getDispute(@Param('id', ParseUUIDPipe) id: string) {
    return this.disputesService.getDisputeForAdmin(id);
  }

  /**
   * PATCH /admin/disputes/:id/assign
   * Assign the dispute to an admin and set status to UNDER_REVIEW.
   */
  @Patch(':id/assign')
  @ApiOperation({ summary: 'Admin: assign dispute to an admin' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiResponse({ status: 200, description: 'Dispute assigned' })
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDisputeDto,
  ) {
    return this.disputesService.assignDispute(id, dto);
  }

  /**
   * POST /admin/disputes/:id/resolve
   * Resolve a dispute with outcome VALID or CHARGEBACK.
   */
  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: resolve a dispute (VALID or CHARGEBACK)' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiResponse({ status: 200, description: 'Dispute resolved' })
  @ApiResponse({ status: 400, description: 'Already resolved' })
  async resolve(
    @CurrentUser() admin: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.disputesService.resolveDispute(id, admin.userId, dto);
  }

  /**
   * POST /admin/disputes/:id/evidence  (multipart/form-data)
   * Admin submits ADMIN-side evidence; auto-released to both parties.
   */
  @Post(':id/evidence')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('files', 5))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Admin: add admin-side evidence to a dispute' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiResponse({ status: 201, description: 'Admin evidence recorded' })
  async addAdminEvidence(
    @CurrentUser() admin: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddEvidenceDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const attachmentKeys = (files ?? []).map(
      (f) => f.originalname ?? f.filename ?? 'attachment',
    );
    return this.disputesService.addAdminEvidence(
      id,
      admin.userId,
      dto,
      attachmentKeys,
    );
  }

  /**
   * PATCH /admin/disputes/:id/release-evidence
   * Release all respondent evidence so the claimant can view it.
   */
  @Patch(':id/release-evidence')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: release respondent evidence to claimant' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiResponse({ status: 200, description: 'Evidence released' })
  async releaseEvidence(@Param('id', ParseUUIDPipe) id: string) {
    await this.disputesService.releaseRespondentEvidence(id);
    return { released: true };
  }
}
