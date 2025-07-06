import { Controller, Post, Get, Param, Body, UseGuards, Query, ParseIntPipe, DefaultValuePipe } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from "@nestjs/swagger"
import { JwtAuthGuard } from "src/auth/guard/jwt.auth.guard"
import { WithdrawService } from "../providers/withdraw.service"
import { WithdrawalResponseDto } from "../dto/withdrawal-response.dto"
import { CreateWithdrawalDto } from "../dto/create-withdraw.dto"

@ApiTags("Withdrawals")
@Controller("withdraw")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WithdrawController {
  constructor(private readonly withdrawService: WithdrawService) {}

  @Post()
  @ApiOperation({ summary: "Create a withdrawal request" })
  @ApiResponse({
    status: 201,
    description: "Withdrawal request created successfully",
    type: WithdrawalResponseDto,
  })
  @ApiResponse({ status: 400, description: "Bad request - Invalid data" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  @ApiResponse({ status: 422, description: "Insufficient balance" })
  async createWithdrawal(req: any, @Body() createWithdrawalDto: CreateWithdrawalDto): Promise<WithdrawalResponseDto> {
    return this.withdrawService.createWithdrawal(req.user.id, createWithdrawalDto)
  }

  @Get("history")
  @ApiOperation({ summary: "Get withdrawal history" })
  @ApiQuery({ name: "page", required: false, type: Number, description: "Page number" })
  @ApiQuery({ name: "limit", required: false, type: Number, description: "Items per page" })
  @ApiResponse({
    status: 200,
    description: "Withdrawal history retrieved successfully",
  })
  async getWithdrawalHistory(
    req: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.withdrawService.getWithdrawalHistory(req.user.id, page, limit)
  }

  @Get(":id")
  @ApiOperation({ summary: "Get withdrawal by ID" })
  @ApiResponse({
    status: 200,
    description: "Withdrawal details retrieved successfully",
    type: WithdrawalResponseDto,
  })
  @ApiResponse({ status: 404, description: "Withdrawal not found" })
  async getWithdrawalById(req: any, @Param('id') id: string): Promise<WithdrawalResponseDto> {
    return this.withdrawService.getWithdrawalById(id, req.user.id)
  }
}
