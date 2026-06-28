import { IsString, IsNotEmpty, IsNumber, IsPositive, IsArray, ValidateNested, IsEmail, Length } from 'class-validator';
import { Type } from 'class-transformer';

export class ParticipantShareDto {
  @IsEmail()
  email: string;

  @IsNumber()
  @IsPositive()
  shareAmount: number;
}

export class CreateSplitDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsNumber()
  @IsPositive()
  totalAmount: number;

  @IsString()
  @Length(3, 3)
  currency: string;

  @IsArray()
  @ValidateNested({ friendships: true })
  @Type(() => ParticipantShareDto)
  participants: ParticipantShareDto[];
}