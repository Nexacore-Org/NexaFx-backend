import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { BeneficiariesService } from './beneficiaries.service';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';
import { JwtAuthGuard } from '../common';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';

@ApiTags('Beneficiaries')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('beneficiaries')
export class BeneficiariesController {
  constructor(private readonly beneficiariesService: BeneficiariesService) {}

  @Post()
  @ApiOperation({ summary: 'Save a new beneficiary' })
  @ApiBody({ type: CreateBeneficiaryDto })
  @ApiResponse({ status: 201, description: 'Beneficiary created successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateBeneficiaryDto,
  ) {
    return this.beneficiariesService.createBeneficiary(user.userId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all saved beneficiaries for the current user',
  })
  @ApiResponse({ status: 200, description: 'List of beneficiaries' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.beneficiariesService.getUserBeneficiaries(user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a beneficiary nickname or details' })
  @ApiParam({ name: 'id', type: String, description: 'Beneficiary ID' })
  @ApiBody({ type: UpdateBeneficiaryDto })
  @ApiResponse({ status: 200, description: 'Beneficiary updated' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Beneficiary not found' })
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateBeneficiaryDto,
  ) {
    return this.beneficiariesService.updateBeneficiary(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a saved beneficiary' })
  @ApiParam({ name: 'id', type: String, description: 'Beneficiary ID' })
  @ApiResponse({ status: 204, description: 'Beneficiary deleted' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Beneficiary not found' })
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.beneficiariesService.deleteBeneficiary(user.userId, id);
  }

  @Patch(':id/set-default')
  @ApiOperation({ summary: 'Set a beneficiary as the default' })
  @ApiParam({ name: 'id', type: String, description: 'Beneficiary ID' })
  @ApiResponse({ status: 200, description: 'Default beneficiary updated' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Beneficiary not found' })
  async setDefault(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.beneficiariesService.setDefault(user.userId, id);
  }
}
