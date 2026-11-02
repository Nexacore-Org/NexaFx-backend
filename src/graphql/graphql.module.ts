import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import depthLimit = require('graphql-depth-limit');
import {
  createComplexityRule,
  fieldExtensionsEstimator,
  simpleEstimator,
} from 'graphql-query-complexity';
import { UserResolver } from './resolvers/user.resolver';
import { TransactionResolver } from './resolvers/transaction.resolver';
import { ExchangeRateResolver } from './resolvers/exchange-rate.resolver';
import { UsersModule } from '../users/users.module';
import { TransactionsModule } from '../transactions/transaction.module';
import { ExchangeRatesModule } from '../exchange-rates/exchange-rates.module';
import { CurrenciesModule } from '../currencies/currencies.module';

export function createGraphQLConfig(
  configService: Pick<ConfigService, 'get'>,
): ApolloDriverConfig {
  const nodeEnv = configService.get<string>('NODE_ENV') ?? process.env.NODE_ENV;
  const isProduction = nodeEnv === 'production';

  return {
    autoSchemaFile: isProduction
      ? true
      : join(process.cwd(), 'src/graphql/schema.gql'),
    playground: !isProduction,
    introspection: !isProduction,
    validationRules: [
      depthLimit(5),
      createComplexityRule({
        estimators: [
          fieldExtensionsEstimator(),
          simpleEstimator({ defaultComplexity: 1 }),
        ],
        maximumComplexity: 50,
      }),
    ],
    context: ({ req }: { req: Express.Request }) => ({ req }),
  };
}

@Module({
  imports: [
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [ConfigModule],
      useFactory: createGraphQLConfig,
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
