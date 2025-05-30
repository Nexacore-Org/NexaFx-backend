import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  HttpStatus,
  ParseUUIDPipe,
} from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from "@nestjs/swagger"
import { JwtAuthGuard } from "src/auth/guard/jwt.auth.guard";
import { ScheduledTransfersService } from "../providers/transfers.service";
import { ScheduledTransferResponseDto } from "../dto/scheduled-transfer-response.dto";
import { CreateScheduledTransferDto } from "../dto/create-scheduled-transfer.dto";
import { ScheduledTransfer } from "../entities/scheduled-transfer.entity";
import { UpdateScheduledTransferDto } from "../dto/update-scheduled-transfer.dto";

@ApiTags("scheduled-transfers")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("scheduled-transfers")
export class ScheduledTransfersController {
  constructor(private readonly scheduledTransfersService: ScheduledTransfersService) {}

  @Post()
  @ApiOperation({ summary: "Create a new scheduled transfer" })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "The scheduled transfer has been successfully created",
    type: ScheduledTransferResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: "Invalid input data",
  })
  async create(req: any, @Body() createDto: CreateScheduledTransferDto): Promise<ScheduledTransfer> {
    return this.scheduledTransfersService.create(req.user.id, createDto)
  }

  @Get()
  @ApiOperation({ summary: 'Get all scheduled transfers for the current user' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns all scheduled transfers for the current user',
    type: [ScheduledTransferResponseDto],
  })
  async findAll(@Request() req): Promise<ScheduledTransfer[]> {
    return this.scheduledTransfersService.findAllForUser(req.user.id);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a specific scheduled transfer by ID" })
  @ApiParam({ name: "id", description: "Scheduled transfer ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "Returns the scheduled transfer",
    type: ScheduledTransferResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Scheduled transfer not found",
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "User does not have permission to access this scheduled transfer",
  })
  async findOne(@Request() req, @Param('id', ParseUUIDPipe) id: string): Promise<ScheduledTransfer> {
    return this.scheduledTransfersService.findOne(id, req.user.id)
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a scheduled transfer" })
  @ApiParam({ name: "id", description: "Scheduled transfer ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "The scheduled transfer has been successfully updated",
    type: ScheduledTransferResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Scheduled transfer not found",
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "User does not have permission to update this scheduled transfer",
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: "Cannot update a transfer that has been executed or cancelled",
  })
  async update(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateScheduledTransferDto,
  ): Promise<ScheduledTransfer> {
    return this.scheduledTransfersService.update(id, req.user.id, updateDto)
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete a scheduled transfer" })
  @ApiParam({ name: "id", description: "Scheduled transfer ID" })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: "The scheduled transfer has been successfully deleted",
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Scheduled transfer not found",
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "User does not have permission to delete this scheduled transfer",
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: "Cannot delete a transfer that has been executed or cancelled",
  })
  async remove(@Request() req, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.scheduledTransfersService.remove(id, req.user.id)
  }

  @Post(":id/execute")
  @ApiOperation({ summary: "Execute a scheduled transfer immediately" })
  @ApiParam({ name: "id", description: "Scheduled transfer ID" })
  @ApiResponse({
    status: HttpStatus.OK,
    description: "The scheduled transfer has been successfully executed",
    type: ScheduledTransferResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: "Scheduled transfer not found",
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: "User does not have permission to execute this scheduled transfer",
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: "Cannot execute a transfer that is not in pending status",
  })
  async executeNow(@Request() req, @Param('id', ParseUUIDPipe) id: string): Promise<ScheduledTransfer> {
    return this.scheduledTransfersService.executeNow(id, req.user.id)
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get statistics about scheduled transfers' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns statistics about scheduled transfers',
  })
  async getStats(@Request() req) {
    return this.scheduledTransfersService.getStats(req.user.id);
  }
}
