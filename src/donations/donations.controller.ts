import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DonationsService } from './donations.service';
import { CreateDonationDto, CreateCharityDto, CreateCampaignDto } from './dto/donations.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Donations')
@Controller('v2')
export class DonationsController {
  constructor(private readonly service: DonationsService) {}

  @Get('charities')
  @Public()
  @ApiOperation({ summary: 'List active charities' })
  listCharities() {
    return this.service.listCharities();
  }

  @Get('campaigns')
  @Public()
  @ApiOperation({ summary: 'List active campaigns' })
  listCampaigns() {
    return this.service.listCampaigns();
  }

  @Get('campaigns/:id')
  @Public()
  @ApiOperation({ summary: 'Get campaign detail with recent donors' })
  getCampaign(@Param('id') id: string) {
    return this.service.getCampaign(id);
  }

  @Post('donations')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Donate to a campaign' })
  donate(
    @Request() req: { user: { userId: string } },
    @Body() dto: CreateDonationDto,
  ) {
    return this.service.donate(req.user.userId, dto);
  }

  @Post('admin/charities')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: create charity' })
  createCharity(@Body() dto: CreateCharityDto) {
    return this.service.createCharity(dto);
  }

  @Patch('admin/charities/:id/verify')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: verify charity' })
  verifyCharity(@Param('id') id: string) {
    return this.service.verifyCharity(id);
  }

  @Post('admin/campaigns')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: create campaign' })
  createCampaign(@Body() dto: CreateCampaignDto) {
    return this.service.createCampaign(dto);
  }
}
