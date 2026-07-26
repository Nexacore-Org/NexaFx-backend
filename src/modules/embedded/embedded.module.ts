import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { EmbeddedPartner } from './entities/embedded-partner.entity';
import { PartnerUser } from './entities/partner-user.entity';
import { EmbeddedService } from './embedded.service';
import { EmbeddedAdminController, EmbeddedPublicController } from './embedded.controller';
import { UsersModule } from '../users/users.module';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmbeddedPartner, PartnerUser]),
    JwtModule.register({ global: true }),
    UsersModule,
    WalletsModule,
  ],
  controllers: [EmbeddedAdminController, EmbeddedPublicController],
  providers: [EmbeddedService],
  exports: [EmbeddedService],
})
export class EmbeddedModule {}
