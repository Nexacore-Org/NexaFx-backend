import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CreateScheduledTransferDto } from '../dto/create-scheduled-transfer.dto';
import { UpdateTransferDto } from '../dto/update-transfer.dto';
import { ScheduledTransfersService } from '../providers/transfers.service';

@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: ScheduledTransfersService) {}

  @Post()
  create(@Body() createScheduledTransferDto: CreateScheduledTransferDto) {
    // TODO: Replace 'user-123' with the actual user ID from the authenticated request context
    return this.transfersService.create('user-123', createScheduledTransferDto);
  }

  @Get()
  findAll() {
    return this.transfersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transfersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTransferDto: UpdateTransferDto) {
    // TODO: Replace 'user-123' with the actual user ID from the authenticated request context
    return this.transfersService.update(id, 'user-123', updateTransferDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    // TODO: Replace 'user-123' with the actual user ID from the authenticated request context
    return this.transfersService.remove(id, 'user-123');
  }
}
