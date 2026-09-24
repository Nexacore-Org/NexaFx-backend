import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
export class User {
  @Field(() => ID)
  id: string;

  @Field()
  email: string;

  @Field({ nullable: true })
  firstName?: string;

  @Field({ nullable: true })
  lastName?: string;

  @Field({ nullable: true })
  phone?: string;

  @Field()
  walletPublicKey: string;

  @Field()
  isVerified: boolean;

  @Field()
  isSuspended: boolean;

  @Field()
  isTwoFactorEnabled: boolean;

  @Field()
  role: string;

  @Field()
  referralCode: string;

  @Field()
  createdAt: string;

  @Field()
  updatedAt: string;
}
