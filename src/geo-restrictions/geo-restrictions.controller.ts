import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { GeoRestrictionsService } from './geo-restrictions.service';
import { CreateGeoRestrictionDto, UpdateGeoRestrictionDto } from './dto/geo-restriction.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/user.entity';

@ApiTags('Geo Restrictions')
@Controller()
export class GeoRestrictionsController {
  constructor(private readonly service: GeoRestrictionsService) {}

  @Get('v2/geo-restrictions')
  @ApiOperation({ summary: 'Public list of restricted countries' })
  async publicList(@Res() res: Response) {
    const data = await this.service.findPublic();
    res.setHeader('Link', '<https://nexafx.com/geo-restrictions>; rel="blocked-by"');
    return res.json(data);
  }

  @Get('admin/geo-restrictions')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: list all geo restrictions' })
  findAll() {
    return this.service.findAll();
  }

  @Post('admin/geo-restrictions')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: create geo restriction' })
  create(@Body() dto: CreateGeoRestrictionDto) {
    return this.service.create(dto);
  }

  @Patch('admin/geo-restrictions/:id')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: update geo restriction' })
  update(@Param('id') id: string, @Body() dto: UpdateGeoRestrictionDto) {
    return this.service.update(id, dto);
  }

  @Delete('admin/geo-restrictions/:id')
  @ApiBearerAuth('access-token')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Admin: remove geo restriction' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
