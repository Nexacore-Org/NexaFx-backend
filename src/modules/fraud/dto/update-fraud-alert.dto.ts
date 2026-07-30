import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { FraudAlertStatus } from '../entities/fraud-alert.entity';

export class UpdateFraudAlertDto {
  @ApiProperty({ enum: FraudAlertStatus })
  @IsEnum(FraudAlertStatus)
  status: FraudAlertStatus;
}
