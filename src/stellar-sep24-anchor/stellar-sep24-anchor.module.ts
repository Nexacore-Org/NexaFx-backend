import { Module } from '@nestjs/common';
import { StellarSep24AnchorController } from './stellar-sep24-anchor.controller';
import { StellarSep24AnchorService } from './stellar-sep24-anchor.service';

@Module({
  controllers: [StellarSep24AnchorController],
  providers: [StellarSep24AnchorService],
  exports: [StellarSep24AnchorService],
})
export class StellarSep24AnchorModule {}
