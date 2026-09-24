import { Expose, Exclude } from 'class-transformer';
import { CardStatus } from '../entities/virtual-card.entity';

export class CardResponseDto {
  @Expose()
  id: string;

  @Expose()
  last4: string;

  @Expose()
  expMonth: string;

  @Expose()
  expYear: string;

  @Expose()
  brand: string;

  @Expose()
  status: CardStatus;

  @Expose()
  spendLimit: string | null;

  @Expose()
  blockedMccs: string[];

  @Expose()
  createdAt: Date;

  @Exclude()
  userId: string;

  @Exclude()
  stripeCardId: string;

  @Exclude()
  updatedAt: Date;
}
