import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { BlacklistService } from './blacklist.service';
import { CreateBlacklistDto } from './dto/create-blacklist.dto';
import { UpdateBlacklistDto } from './dto/update-blacklist.dto';

@Controller('blacklist')
export class BlacklistController {
  constructor(private readonly blacklistService: BlacklistService) {}

  @Post()
  create(@Body() createBlacklistDto: CreateBlacklistDto) {
    return this.blacklistService.create(createBlacklistDto);
  }

  @Get()
  findAll() {
    return this.blacklistService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.blacklistService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateBlacklistDto: UpdateBlacklistDto) {
    return this.blacklistService.update(+id, updateBlacklistDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.blacklistService.remove(+id);
  }
}
