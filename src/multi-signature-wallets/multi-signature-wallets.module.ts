import { Module } from '@nestjs/common';
import { MultiSignatureWalletsController } from './multi-signature-wallets.controller';
import { MultiSignatureWalletsService } from './multi-signature-wallets.service';

@Module({
  controllers: [MultiSignatureWalletsController],
  providers: [MultiSignatureWalletsService],
  exports: [MultiSignatureWalletsService],
})
export class MultiSignatureWalletsModule {}
