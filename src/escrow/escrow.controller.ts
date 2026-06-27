import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { EscrowService } from './escrow.service';
import { CreateEscrowDto } from './dto/create-escrow.dto';
import { EscrowQueryDto } from './dto/escrow-query.dto';
import { AdminResolveEscrowDto } from './dto/admin-resolve-escrow.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';

@ApiTags('Escrow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('escrow')
export class EscrowController {
  constructor(private readonly escrowService: EscrowService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new escrow agreement' })
  @ApiBody({ type: CreateEscrowDto })
  @ApiResponse({ status: 201, description: 'Escrow created successfully' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async createEscrow(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateEscrowDto,
  ) {
    return this.escrowService.createEscrow(user.userId, dto);
  }

  @Post(':id/fund')
  @ApiOperation({ summary: 'Fund a pending escrow agreement' })
  @ApiParam({ name: 'id', type: String, description: 'Escrow UUID' })
  @ApiResponse({ status: 200, description: 'Escrow funded successfully' })
  async fundEscrow(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.escrowService.fundEscrow(user.userId, id);
  }

  @Post(':id/release')
  @ApiOperation({ summary: 'Release funds from a funded escrow to recipient wallet' })
  @ApiParam({ name: 'id', type: String, description: 'Escrow UUID' })
  @ApiResponse({ status: 200, description: 'Escrow released successfully' })
  async releaseEscrow(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.escrowService.releaseEscrow(user.userId, id);
  }

  @Post(':id/refund')
  @ApiOperation({ summary: 'Refund a funded escrow back to the sender' })
  @ApiParam({ name: 'id', type: String, description: 'Escrow UUID' })
  @ApiResponse({ status: 200, description: 'Escrow refunded successfully' })
  async refundEscrow(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.escrowService.refundEscrow(user.userId, id);
  }

  @Post(':id/dispute')
  @ApiOperation({ summary: 'Dispute a funded escrow agreement' })
  @ApiParam({ name: 'id', type: String, description: 'Escrow UUID' })
  @ApiResponse({ status: 200, description: 'Escrow disputed successfully' })
  async disputeEscrow(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.escrowService.disputeEscrow(user.userId, id);
  }

  @Get()
  @ApiOperation({ summary: 'List escrows for the current user' })
  @ApiResponse({ status: 200, description: 'Escrow list retrieved successfully' })
  async findUserEscrows(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: EscrowQueryDto,
  ) {
    return this.escrowService.findUserEscrows(user.userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get escrow details' })
  @ApiParam({ name: 'id', type: String, description: 'Escrow UUID' })
  @ApiResponse({ status: 200, description: 'Escrow details retrieved successfully' })
  async findOne(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.escrowService.findOne(user.userId, id);
  }
}

@ApiTags('Admin Escrow')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/escrow')
export class EscrowAdminController {
  constructor(private readonly escrowService: EscrowService) {}

  @Get()
  @ApiOperation({ summary: 'List escrows for admin' })
  @ApiResponse({ status: 200, description: 'Escrow list retrieved successfully' })
  async findAll(@Query() query: EscrowQueryDto) {
    return this.escrowService.findAll(query);
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve escrow dispute or refund as admin' })
  @ApiParam({ name: 'id', type: String, description: 'Escrow UUID' })
  @ApiBody({ type: AdminResolveEscrowDto })
  @ApiResponse({ status: 200, description: 'Escrow resolution applied successfully' })
  async resolveEscrow(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminResolveEscrowDto,
  ) {
    return this.escrowService.resolveEscrow(id, dto);
  }
}
