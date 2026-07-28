import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsEnum,
  IsUrl,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProposalType } from '../entities/proposal.entity';

export class UpgradeConfigDto {
  @IsString() @IsNotEmpty() contractId: string;
  @IsString() @IsNotEmpty() newWasmHash: string;
  @IsString() @IsNotEmpty() contractName: string;
  @IsString() @IsNotEmpty() changeDescription: string;
  @IsUrl() auditReportUrl: string;
}

export class CreateProposalDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsDateString()
  @IsNotEmpty()
  votingStartAt: string;

  @IsDateString()
  @IsNotEmpty()
  votingEndAt: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsNotEmpty()
  quorumPercent: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsNotEmpty()
  passThresholdPercent: number;

  @IsOptional()
  @IsString()
  stellarContractId?: string;

  @ApiPropertyOptional({ enum: ProposalType })
  @IsOptional()
  @IsEnum(ProposalType)
  proposalType?: ProposalType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => UpgradeConfigDto)
  upgradeConfig?: UpgradeConfigDto;
}
