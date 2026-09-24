import { ObjectType, Field, ID, Float, Int } from '@nestjs/graphql';

@ObjectType()
export class ExchangeRate {
  @Field()
  from: string;

  @Field()
  to: string;

  @Field(() => Float)
  rate: number;

  @Field({ nullable: true })
  timestamp?: string;
}

@ObjectType()
export class Currency {
  @Field(() => ID)
  id: string;

  @Field()
  code: string;

  @Field()
  name: string;

  @Field({ nullable: true })
  symbol?: string;

  @Field(() => Int)
  decimals: number;

  @Field()
  isBase: boolean;

  @Field()
  isActive: boolean;
}
