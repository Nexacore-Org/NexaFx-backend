import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { CreateScheduledTransferDto } from '../dto/create-scheduled-transfer.dto';
import { UpdateScheduledTransferDto } from '../dto/update-scheduled-transfer.dto';
import { ScheduledTransferResponseDto } from '../dto/scheduled-transfer-response.dto';

@ApiTags('Scheduled Transfers')
@Controller('scheduled-transfers')
export class ScheduledTransfersController {
  @Post()
  @ApiOperation({ summary: 'Create a new scheduled transfer' })
  @ApiBody({
    type: CreateScheduledTransferDto,
    examples: {
      default: {
        value: {
          fromCurrencyId: 'uuid-from',
          toCurrencyId: 'uuid-to',
          amount: 100.5,
          scheduledAt: '2025-06-15T10:00:00Z',
          destinationAddress: 'wallet-address',
          reference: 'Salary June',
          metadata: { note: 'Monthly salary' },
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Scheduled transfer created',
    type: ScheduledTransferResponseDto,
  })
  create(): ScheduledTransferResponseDto | undefined {
    return undefined;
  }

  @Get()
  @ApiOperation({ summary: 'Get all scheduled transfers' })
  @ApiResponse({
    status: 200,
    description: 'List of scheduled transfers',
    type: [ScheduledTransferResponseDto],
  })
  findAll(): ScheduledTransferResponseDto[] {
    return [];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a scheduled transfer by ID' })
  @ApiParam({ name: 'id', description: 'Scheduled transfer ID' })
  @ApiResponse({
    status: 200,
    description: 'Scheduled transfer details',
    type: ScheduledTransferResponseDto,
  })
  findOne(): ScheduledTransferResponseDto | undefined {
    return undefined;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a scheduled transfer' })
  @ApiParam({ name: 'id', description: 'Scheduled transfer ID' })
  @ApiBody({ type: UpdateScheduledTransferDto })
  @ApiResponse({
    status: 200,
    description: 'Scheduled transfer updated',
    type: ScheduledTransferResponseDto,
  })
  update(): ScheduledTransferResponseDto | undefined {
    return undefined;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a scheduled transfer' })
  @ApiParam({ name: 'id', description: 'Scheduled transfer ID' })
  @ApiResponse({ status: 204, description: 'Scheduled transfer deleted' })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(): void {}
}
