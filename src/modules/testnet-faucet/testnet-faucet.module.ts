import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TestnetFaucetController } from './testnet-faucet.controller';
import { TestnetFaucetService } from './testnet-faucet.service';
import { FaucetRequest } from './entities/faucet-request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([FaucetRequest])],
  controllers: [TestnetFaucetController],
  providers: [TestnetFaucetService],
  exports: [TestnetFaucetService],
})
export class TestnetFaucetModule {}
