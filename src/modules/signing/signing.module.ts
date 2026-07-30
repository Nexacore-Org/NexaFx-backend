import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionSigningKey } from './entities/transaction-signing-key.entity';
import { SigningService } from './signing.service';
import { SigningController } from './signing.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionSigningKey])],
  controllers: [SigningController],
  providers: [SigningService],
  exports: [SigningService],
})
export class SigningModule {}
