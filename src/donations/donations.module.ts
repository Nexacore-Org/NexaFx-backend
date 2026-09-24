import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Charity } from './entities/charity.entity';
import { DonationCampaign } from './entities/donation-campaign.entity';
import { Donation } from './entities/donation.entity';
import { DonationsService } from './donations.service';
import { DonationsController } from './donations.controller';
import { StellarModule } from '../modules/stellar/stellar.module';
import { WalletsModule } from '../wallets/wallets.module';
import { MailModule } from '../modules/mail/mail.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Charity, DonationCampaign, Donation]),
    StellarModule,
    WalletsModule,
    MailModule,
    UsersModule,
  ],
  controllers: [DonationsController],
  providers: [DonationsService],
  exports: [DonationsService],
})
export class DonationsModule {}
