import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { RateLockService } from './ratelock.service'; 
import { CreateRatelockDto } from './dto/create-ratelock.dto';
import { UpdateRatelockDto } from './dto/update-ratelock.dto';

@Controller('ratelock')
export class RatelockController {
  constructor(private readonly ratelockService: RateLockService) {}

  @Post()
  create(@Body() createRatelockDto: CreateRatelockDto) {
    return this.ratelockService.create(createRatelockDto);
  }

  @Get()
  findAll() {
    return this.ratelockService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ratelockService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRatelockDto: UpdateRatelockDto) {
    return this.ratelockService.update(+id, updateRatelockDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ratelockService.remove(+id);
  }
}
