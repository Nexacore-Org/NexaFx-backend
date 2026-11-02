jest.mock('@nestjs/graphql', () => {
  const noop = () => () => undefined;
  return {
    GraphQLModule: {
      forRootAsync: jest
        .fn()
        .mockReturnValue({ module: class MockGqlModule {} }),
    },
    Resolver: noop,
    Query: noop,
    Mutation: noop,
    Args: noop,
    ObjectType: noop,
    Field: noop,
    ID: String,
    Float: Number,
    Int: Number,
    registerEnumType: jest.fn(),
    GqlExecutionContext: { create: jest.fn() },
  };
});

jest.mock('@nestjs/apollo', () => ({
  ApolloDriver: class ApolloDriver {},
}));

jest.mock('@nestjs/config', () => ({
  ConfigModule: class ConfigModule {},
  ConfigService: class ConfigService {},
}));

jest.mock('@nestjs/typeorm', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Inject } = require('@nestjs/common');
  const getRepositoryToken = (entity: { name?: string } | string) =>
    `${typeof entity === 'string' ? entity : (entity?.name ?? 'Entity')}Repository`;
  return {
    InjectRepository: (entity: { name?: string } | string) =>
      Inject(getRepositoryToken(entity)),
    getRepositoryToken,
    TypeOrmModule: {
      forFeature: jest.fn(),
      forRoot: jest.fn(),
    },
  };
});

jest.mock('@nestjs/swagger', () => {
  const noop = () => () => undefined;
  return {
    ApiTags: noop,
    ApiBearerAuth: noop,
    ApiOperation: noop,
    ApiQuery: noop,
    ApiResponse: noop,
    ApiProperty: noop,
    ApiPropertyOptional: noop,
  };
});

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () =>
    class MockAuthGuard {
      canActivate() {
        return true;
      }
    },
}));

jest.mock('../transactions/services/transaction.service', () => ({
  TransactionsService: class TransactionsService {},
}));

jest.mock('../transactions/transaction.module', () => ({
  TransactionsModule: class TransactionsModule {},
}));

jest.mock('../users/users.module', () => ({
  UsersModule: class UsersModule {},
}));

jest.mock('../exchange-rates/exchange-rates.module', () => ({
  ExchangeRatesModule: class ExchangeRatesModule {},
}));

jest.mock('../currencies/currencies.module', () => ({
  CurrenciesModule: class CurrenciesModule {},
}));

import * as fs from 'fs';
import { join } from 'path';
import { createGraphQLConfig, GraphQLApiModule } from './graphql.module';

describe('GraphQLApiModule (#1519)', () => {
  it('defines GraphQLApiModule', () => {
    expect(GraphQLApiModule).toBeDefined();
  });

  it('uses autoSchemaFile: true (in-memory) in production so read-only /app does not fail with EACCES', () => {
    const configService = {
      get: jest.fn((key: string) =>
        key === 'NODE_ENV' ? 'production' : undefined,
      ),
    };

    const config = createGraphQLConfig(configService);

    expect(config.autoSchemaFile).toBe(true);
    expect(config.playground).toBe(false);
    expect(config.introspection).toBe(false);
  });

  it('writes autoSchemaFile to src/graphql/schema.gql only in non-production environments', () => {
    const configService = {
      get: jest.fn((key: string) =>
        key === 'NODE_ENV' ? 'development' : undefined,
      ),
    };

    const config = createGraphQLConfig(configService);

    expect(config.autoSchemaFile).toBe(
      join(process.cwd(), 'src/graphql/schema.gql'),
    );
    expect(config.playground).toBe(true);
    expect(config.introspection).toBe(true);
  });

  it('removes the unused schema-first src/graphql/schemas directory while keeping src/graphql/schema.gql', () => {
    const schemasDir = join(process.cwd(), 'src/graphql/schemas');
    const codeFirstSchema = join(process.cwd(), 'src/graphql/schema.gql');

    expect(fs.existsSync(schemasDir)).toBe(false);
    expect(fs.existsSync(codeFirstSchema)).toBe(true);
  });
});
