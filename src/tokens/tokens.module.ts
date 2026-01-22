import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from './refresh-token.entity';
import { RefreshTokensService } from './refresh-tokens.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([RefreshToken])],
  providers: [RefreshTokensService],
  exports: [RefreshTokensService],
})
export class TokensModule {}
