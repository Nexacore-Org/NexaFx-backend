import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { UserResolver } from './resolvers/user.resolver';
import { TransactionResolver } from './resolvers/transaction.resolver';
import { ExchangeRateResolver } from './resolvers/exchange-rate.resolver';
import { UsersModule } from '../users/users.module';
import { TransactionsModule } from '../transactions/transaction.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { CurrenciesModule } from '../currencies/currencies.module';
import { depthLimitRule } from './rules/depth-limit.rule';

@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isProduction =
          configService.get<string>('NODE_ENV') === 'production';
        return {
          typePaths: [join(__dirname, 'schemas/**/*.graphql')],
          playground: !isProduction,
          introspection: !isProduction,
          validationRules: [depthLimitRule(5)],
          context: ({ req }: { req: Express.Request }) => ({ req }),
        };
      },
      inject: [ConfigService],
    }),
    UsersModule,
    TransactionsModule,
    ExchangeRatesModule,
    CurrenciesModule,
  ],
  providers: [UserResolver, TransactionResolver, ExchangeRateResolver],
})
export class GraphQLApiModule {}
