import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ReferralItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'j***@d***.com' })
  maskedEmail: string;

  @ApiPropertyOptional({ example: 'John', nullable: true })
  firstName: string | null;

  @ApiProperty()
  status: string;

  @ApiPropertyOptional({ nullable: true })
  rewardAmount?: string | null;

  @ApiPropertyOptional({ nullable: true })
  rewardCurrency?: string | null;

  @ApiPropertyOptional({ nullable: true })
  rewardedAt?: Date | null;

  @ApiProperty()
  createdAt: Date;
}

export class ListReferralsQueryDto extends PaginationDto {
  override limit?: number = 20;
}

export class PaginatedReferralsResponseDto {
  @ApiProperty({ type: [ReferralItemDto] })
  data: ReferralItemDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}
