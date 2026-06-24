import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>('NODE_ENV');
        const useSsl =
          nodeEnv === 'production' || configService.get<boolean>('DB_SSL');

        return {
          type: 'postgres',
          url: configService.get<string>('DATABASE_URL'),
          synchronize: false,
          logging: nodeEnv === 'development',
          autoLoadEntities: true,
          ssl: useSsl ? { rejectUnauthorized: false } : false,
          extra: {
            max: 10,
            idleTimeoutMillis: 30000,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
