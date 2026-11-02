import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ScreeningStatus } from '../entities/kyc-screening.entity';

export class ListScreeningsQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter screenings by status',
    enum: ScreeningStatus,
  })
  @IsOptional()
  @IsEnum(ScreeningStatus)
  status?: ScreeningStatus;

  override limit?: number = 20;
}
