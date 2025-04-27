import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guard/jwt.auth.guard';
import { Roles } from 'src/common/decorators/roles.decorators';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/user/entities/user.entity';

@Controller('transactions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransactionsController {
  @Get('all')
  @Roles(UserRole.ADMIN, UserRole.AUDITOR)
  findAll() {
    // Admins can view all transactions
  }

  @Get('user')
  @Roles(UserRole.USER)
  findMyTransactions(@Req() req) {
    const userId = req.user.id;
    // Return only transactions belonging to the authenticated user
  }

  @Post()
  @Roles(UserRole.USER, UserRole.ADMIN)
  createTransaction() {
    // Users and Admins can create transactions
  }
}
