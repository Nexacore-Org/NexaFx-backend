import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Blacklist } from './entities/blacklist.entity'; 

@Injectable()
export class BlacklistService {
  constructor(
    @InjectRepository(Blacklist)
    private blacklistRepo: Repository<Blacklist>,
  ) {}

  async isBlacklisted(walletAddress: string): Promise<boolean> {
    const record = await this.blacklistRepo.findOne({ where: { walletAddress } });
    return !!record;
  }

  async isFrozen(walletAddress: string): Promise<boolean> {
    const record = await this.blacklistRepo.findOne({ where: { walletAddress } });
    return record?.isFrozen || false;
  }
}
