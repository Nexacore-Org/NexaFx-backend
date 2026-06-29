import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProd = configService.get<string>('NODE_ENV') === 'production';
        const isDev = configService.get<string>('NODE_ENV') === 'development';

        return {
          type: 'postgres',
          url: configService.get<string>('DATABASE_URL'),
          autoLoadEntities: true,
          // synchronize must ALWAYS be false — no exceptions
          synchronize: false,
          logging: isDev,
          extra: {
            max: 10,
            idleTimeoutMillis: 30000,
          },
          ssl: isProd ? { rejectUnauthorized: false } : false,
          migrations: [__dirname + '/migrations/*{.ts,.js}'],
        };
      },
    }),
  ],
})
export class DatabaseModule {}