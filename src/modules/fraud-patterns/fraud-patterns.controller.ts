import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { FraudPatternsService } from './fraud-patterns.service';
import {
  CreateFraudPatternDto,
  TestFraudPatternDto,
  UpdateFraudPatternDto,
} from './dto/fraud-pattern.dto';

@Controller('admin/fraud-patterns')
export class FraudPatternsController {
  constructor(private readonly fraudPatternsService: FraudPatternsService) {}

  @Post()
  create(@Body() dto: CreateFraudPatternDto) {
    return this.fraudPatternsService.create(dto);
  }

  @Get()
  findAll() {
    return this.fraudPatternsService.findAll();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFraudPatternDto) {
    return this.fraudPatternsService.update(id, dto);
  }

  @Delete(':id')
  deactivate(@Param('id') id: string) {
    return this.fraudPatternsService.deactivate(id);
  }

  @Post('test')
  test(@Body() dto: TestFraudPatternDto) {
    return this.fraudPatternsService.test(dto.patternId, dto.transactionScenario);
  }
}
