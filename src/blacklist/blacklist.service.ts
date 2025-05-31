import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Blacklist } from './entities/blacklist.entity'; 
import { CreateBlacklistDto } from './dto/create-blacklist.dto';
import { UpdateBlacklistDto } from './dto/update-blacklist.dto';

@Injectable()
export class BlacklistService {
  create(createBlacklistDto: CreateBlacklistDto) {
    throw new Error('Method not implemented.');
  }
  findAll() {
    throw new Error('Method not implemented.');
  }
  update(arg0: number, updateBlacklistDto: UpdateBlacklistDto) {
    throw new Error('Method not implemented.');
  }
  remove(arg0: number) {
    throw new Error('Method not implemented.');
  }
  findOne(arg0: number) {
    throw new Error('Method not implemented.');
  }
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
