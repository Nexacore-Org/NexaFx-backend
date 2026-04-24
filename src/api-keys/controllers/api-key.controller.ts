import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { ApiKeyService } from '../services/api-key.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/user.entity';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CreateApiKeyDto } from '../dto/create-api-key.dto';
import {
  ApiKeyResponseDto,
  ApiKeyMetadataDto,
} from '../dto/api-key-response.dto';
import { ListApiKeysQueryDto } from '../dto/list-api-keys-query.dto';
import { SkipApiKeyAuth } from '../decorators/skip-api-key-auth.decorator';

@ApiTags('Admin - API Keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SkipApiKeyAuth()
@Controller('admin/api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a new API key (Admin only)' })
  @ApiBody({ type: CreateApiKeyDto })
  @ApiResponse({
    status: 201,
    description: 'API key generated successfully',
    type: ApiKeyResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  async generateKey(
    @Body() createDto: CreateApiKeyDto,
  ): Promise<ApiKeyResponseDto> {
    const { key, apiKey } = await this.apiKeyService.generateKey(
      createDto.name,
      createDto.scopes,
      createDto.expiresAt,
    );

    return {
      key,
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      scopes: apiKey.scopes,
      isActive: apiKey.isActive,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all API keys with filtering (Admin only)' })
  @ApiQuery({ type: ListApiKeysQueryDto })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated list of API keys',
    schema: {
      type: 'object',
      properties: {
        keys: {
          type: 'array',
          items: { $ref: '#/components/schemas/ApiKeyMetadataDto' },
        },
        total: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  async listKeys(
    @Query() query: ListApiKeysQueryDto,
  ): Promise<{ keys: ApiKeyMetadataDto[]; total: number }> {
    const { keys, total } = await this.apiKeyService.listKeys(query);

    return {
      keys: keys.map((key) => ({
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        scopes: key.scopes,
        isActive: key.isActive,
        expiresAt: key.expiresAt,
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
        updatedAt: key.updatedAt,
      })),
      total,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get API key details (Admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'API Key UUID' })
  @ApiResponse({
    status: 200,
    description: 'Returns API key metadata',
    type: ApiKeyMetadataDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async getKeyById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApiKeyMetadataDto> {
    const apiKey = await this.apiKeyService.getKeyById(id);

    return {
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      scopes: apiKey.scopes,
      isActive: apiKey.isActive,
      expiresAt: apiKey.expiresAt,
      lastUsedAt: apiKey.lastUsedAt,
      createdAt: apiKey.createdAt,
      updatedAt: apiKey.updatedAt,
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API key (Admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'API Key UUID' })
  @ApiResponse({
    status: 200,
    description: 'API key revoked successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'API key revoked successfully' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async revokeKey(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.apiKeyService.revokeKey(id);

    return { message: 'API key revoked successfully' };
  }

  @Post(':id/rotate')
  @ApiOperation({ summary: 'Rotate an API key (Admin only)' })
  @ApiParam({ name: 'id', type: String, description: 'API Key UUID' })
  @ApiQuery({
    name: 'gracePeriodMinutes',
    type: Number,
    required: false,
    description: 'Grace period in minutes for old key (default: 5)',
    example: 5,
  })
  @ApiResponse({
    status: 201,
    description: 'API key rotated successfully',
    type: ApiKeyResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async rotateKey(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('gracePeriodMinutes') gracePeriodMinutes?: number,
  ): Promise<ApiKeyResponseDto> {
    const gracePeriod = gracePeriodMinutes || 5;
    const { key, apiKey } = await this.apiKeyService.rotateKey(
      id,
      gracePeriod,
    );

    return {
      key,
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      scopes: apiKey.scopes,
      isActive: apiKey.isActive,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
    };
  }
}
