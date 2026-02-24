import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TwoFactorService } from './two-factor.service';
import { SetupTwoFactorResponseDto } from './dto/setup-two-factor-response.dto';
import { TwoFactorCodeDto } from './dto/two-factor-code.dto';
import { TwoFactorStatusDto } from './dto/two-factor-status.dto';

@ApiTags('Two Factor')
@ApiBearerAuth('access-token')
@Controller('two-factor')
export class TwoFactorController {
  constructor(private readonly twoFactorService: TwoFactorService) {}

  @Post('setup')
  @ApiOperation({ summary: 'Generate authenticator setup secret and QR code' })
  @ApiResponse({
    status: 201,
    description: 'Two-factor setup secret generated',
    type: SetupTwoFactorResponseDto,
  })
  async setup(
    @Request() req: { user: { userId: string } },
  ): Promise<SetupTwoFactorResponseDto> {
    return this.twoFactorService.generateSecret(req.user.userId);
  }

  @Post('enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable two-factor authentication' })
  @ApiBody({ type: TwoFactorCodeDto })
  @ApiResponse({
    status: 200,
    description: 'Two-factor authentication enabled',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Two-factor authentication enabled',
        },
      },
    },
  })
  async enable(
    @Request() req: { user: { userId: string } },
    @Body() dto: TwoFactorCodeDto,
  ): Promise<{ message: string }> {
    await this.twoFactorService.enableTwoFactor(
      req.user.userId,
      dto.totpCode,
    );

    return { message: 'Two-factor authentication enabled' };
  }

  @Post('disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable two-factor authentication' })
  @ApiBody({ type: TwoFactorCodeDto })
  @ApiResponse({
    status: 200,
    description: 'Two-factor authentication disabled',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example: 'Two-factor authentication disabled',
        },
      },
    },
  })
  async disable(
    @Request() req: { user: { userId: string } },
    @Body() dto: TwoFactorCodeDto,
  ): Promise<{ message: string }> {
    await this.twoFactorService.disableTwoFactor(
      req.user.userId,
      dto.totpCode,
    );

    return { message: 'Two-factor authentication disabled' };
  }

  @Get('status')
  @ApiOperation({ summary: 'Get two-factor authentication status' })
  @ApiResponse({
    status: 200,
    description: 'Two-factor status fetched',
    type: TwoFactorStatusDto,
  })
  async status(
    @Request() req: { user: { userId: string } },
  ): Promise<TwoFactorStatusDto> {
    return this.twoFactorService.getStatus(req.user.userId);
  }
}
