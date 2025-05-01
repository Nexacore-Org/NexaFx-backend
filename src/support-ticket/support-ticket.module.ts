import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupportTicketsController } from './support-tickets.controller';
import { SupportTicketsService } from './support-tickets.service';
import { SupportTicket } from './entities/support-ticket.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupportTicket]),
    AuthModule,
  ],
  controllers: [SupportTicketsController],
  providers: [SupportTicketsService],
  exports: [SupportTicketsService],
})
export class SupportTicketsModule {}

// src/app.module.ts (Update to include the new module)
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { SupportTicketsModule } from './support-tickets/support-tickets.module';
// ... other imports

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST'),
        port: configService.get('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_DATABASE'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: configService.get('NODE_ENV') !== 'production',
      }),
    }),
    UsersModule,
    AuthModule,
    SupportTicketsModule,
    // ... other modules
  ],
})
export class AppModule {}