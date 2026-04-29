import { IsString, IsNotEmpty, IsDateString, IsNumber, Min, Max } from 'class-validator';

export class CreateProposalDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

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
}
