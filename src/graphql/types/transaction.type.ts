import { ObjectType, Field, ID, Int } from '@nestjs/graphql';

@ObjectType()
export class Transaction {
  @Field(() => ID)
  id: string;

  @Field()
  userId: string;

  @Field()
  type: string;

  @Field()
  amount: string;

  @Field()
  currency: string;

  @Field({ nullable: true })
  rate?: string;

  @Field()
  status: string;

  @Field({ nullable: true })
  txHash?: string;

  @Field({ nullable: true })
  failureReason?: string;

  @Field({ nullable: true })
  feeAmount?: string;

  @Field({ nullable: true })
  feeCurrency?: string;

  @Field({ nullable: true })
  toCurrency?: string;

  @Field({ nullable: true })
  toAmount?: string;

  @Field()
  createdAt: string;

  @Field()
  updatedAt: string;
}

@ObjectType()
export class PaginatedTransactions {
  @Field(() => [Transaction])
  transactions: Transaction[];

  @Field(() => Int)
  total: number;
}
