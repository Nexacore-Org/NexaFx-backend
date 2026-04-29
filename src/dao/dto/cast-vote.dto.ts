import { IsEnum, IsNotEmpty } from 'class-validator';
import { VoteChoice } from '../entities/vote.entity';

export class CastVoteDto {
  @IsEnum(VoteChoice)
  @IsNotEmpty()
  choice: VoteChoice;
}
