import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
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
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CreateDisputeDto } from '../dto/create-dispute.dto';
import { AddEvidenceDto } from '../dto/add-evidence.dto';
import { DisputeQueryDto } from '../dto/dispute-query.dto';

@ApiTags('Disputes')
@ApiBearerAuth()
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  /**
   * POST /disputes
   * Raise a new dispute for a completed transaction.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Raise a dispute for a completed transaction' })
  @ApiResponse({ status: 201, description: 'Dispute created' })
  @ApiResponse({
    status: 409,
    description: 'Dispute already exists for this transaction',
  })
  @ApiResponse({
    status: 422,
    description: 'Dispute window expired or transaction not completed',
  })
  async createDispute(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateDisputeDto,
  ) {
    return this.disputesService.createDispute(user.userId, dto);
  }

  /**
   * GET /disputes
   * List the current user's disputes (paginated).
   */
  @Get()
  @ApiOperation({ summary: "List current user's disputes" })
  @ApiResponse({ status: 200, description: 'Paginated dispute list' })
  async listDisputes(
    @CurrentUser() user: { userId: string },
    @Query() query: DisputeQueryDto,
  ) {
    return this.disputesService.listUserDisputes(user.userId, query);
  }

  /**
   * GET /disputes/:id
   * Get a single dispute (claimant only; respondent evidence hidden until released).
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get a single dispute (evidence visibility enforced)',
  })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiResponse({ status: 200, description: 'Dispute detail' })
  @ApiResponse({ status: 403, description: 'Not your dispute' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async getDispute(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.disputesService.getDisputeForUser(id, user.userId);
  }

  /**
   * POST /disputes/:id/evidence  (multipart/form-data)
   * Submit evidence for an open or under-review dispute.
   * Accepts up to 5 files.
   */
  @Post(':id/evidence')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('files', 5))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Submit evidence (multipart) for a dispute' })
  @ApiParam({ name: 'id', description: 'Dispute UUID' })
  @ApiResponse({ status: 201, description: 'Evidence recorded' })
  @ApiResponse({ status: 400, description: 'Dispute is no longer open' })
  @ApiResponse({ status: 403, description: 'Not a party to this dispute' })
  async addEvidence(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddEvidenceDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    // Extract file keys from uploaded files (originalname serves as key placeholder;
    // in production these would be S3 keys returned after upload)
    const attachmentKeys = (files ?? []).map(
      (f) => f.originalname ?? f.filename ?? 'attachment',
    );
    return this.disputesService.addEvidence(
      id,
      user.userId,
      dto,
      attachmentKeys,
    );
  }
}
