import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { TransactionTagsService } from './transaction-tags.service';
import { CreateTransactionTagDto } from './dto/create-transaction-tag.dto';
import { UpdateTransactionTagDto } from './dto/update-transaction-tag.dto';
import { AssignTagDto } from './dto/assign-tag.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Role } from '../users/enums/role.enum';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('transaction-tags')
@UseGuards(JwtAuthGuard)
export class TransactionTagsController {
  constructor(private readonly transactionTagsService: TransactionTagsService) {}

  @Post()
  create(@Req() req, @Body() createTransactionTagDto: CreateTransactionTagDto) {
    return this.transactionTagsService.create(
      req.user.id, 
      createTransactionTagDto, 
      req.user.roles || []
    );
  }

  @Get()
  findAll(@Req() req) {
    return this.transactionTagsService.findAll(
      req.user.id, 
      req.user.roles || []
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req) {
    return this.transactionTagsService.findOne(
      id, 
      req.user.id, 
      req.user.roles || []
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string, 
    @Body() updateTransactionTagDto: UpdateTransactionTagDto,
    @Req() req
  ) {
    return this.transactionTagsService.update(
      id, 
      updateTransactionTagDto, 
      req.user.id, 
      req.user.roles || []
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req) {
    return this.transactionTagsService.remove(
      id, 
      req.user.id, 
      req.user.roles || []
    );
  }
}