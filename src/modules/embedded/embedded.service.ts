import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { EmbeddedPartner } from './entities/embedded-partner.entity';
import { PartnerUser } from './entities/partner-user.entity';
import { UsersService } from '../users/users.service';
import { WalletsService } from '../wallets/wallets.service';

@Injectable()
export class EmbeddedService {
  constructor(
    @InjectRepository(EmbeddedPartner)
    private readonly partnerRepo: Repository<EmbeddedPartner>,
    @InjectRepository(PartnerUser)
    private readonly partnerUserRepo: Repository<PartnerUser>,
    private readonly usersService: UsersService,
    private readonly walletsService: WalletsService,
    private readonly jwtService: JwtService,
  ) {}

  async createPartner(dto: {
    name: string;
    webhookUrl: string;
    allowedScopes?: string[];
    brandColour?: string;
    logoUrl?: string;
  }): Promise<{ partner: EmbeddedPartner; clientSecret: string }> {
    const clientId = `nexafx_${crypto.randomBytes(16).toString('hex')}`;
    const clientSecret = crypto.randomBytes(32).toString('hex');
    const clientSecretHash = await bcrypt.hash(clientSecret, 12);

    const partner = this.partnerRepo.create({
      name: dto.name,
      webhookUrl: dto.webhookUrl,
      allowedScopes: dto.allowedScopes || [],
      clientId,
      clientSecretHash,
      isActive: true,
      brandColour: dto.brandColour || null,
      logoUrl: dto.logoUrl || null,
    });

    const saved = await this.partnerRepo.save(partner);
    return { partner: saved, clientSecret };
  }

  async listPartners(): Promise<EmbeddedPartner[]> {
    return this.partnerRepo.find({ order: { createdAt: 'DESC' } });
  }

  async updatePartner(
    id: string,
    dto: Partial<{
      name: string;
      webhookUrl: string;
      allowedScopes: string[];
      isActive: boolean;
      brandColour: string | null;
      logoUrl: string | null;
    }>,
  ): Promise<EmbeddedPartner> {
    const partner = await this.partnerRepo.findOne({ where: { id } });
    if (!partner) {
      throw new NotFoundException('Partner not found');
    }
    Object.assign(partner, dto);
    return this.partnerRepo.save(partner);
  }

  async authenticatePartner(
    clientId: string,
    clientSecret: string,
    partnerUserId: string,
  ): Promise<{ access_token: string }> {
    const partner = await this.partnerRepo.findOne({ where: { clientId } });
    if (!partner || !partner.isActive) {
      throw new UnauthorizedException('Invalid or inactive partner');
    }

    const secretValid = await bcrypt.compare(clientSecret, partner.clientSecretHash);
    if (!secretValid) {
      throw new UnauthorizedException('Invalid client secret');
    }

    let partnerUser = await this.partnerUserRepo.findOne({
      where: { partnerId: partner.id, partnerUserId },
    });

    if (!partnerUser) {
      const nexafxUser = await this.usersService.createEmbeddedUser();
      const wallet = await this.walletsService.createWallet(nexafxUser.id, 'XLM');

      partnerUser = this.partnerUserRepo.create({
        partnerId: partner.id,
        partnerUserId,
        nexafxUserId: nexafxUser.id,
      });
      await this.partnerUserRepo.save(partnerUser);
    }

    const payload = {
      sub: partnerUser.nexafxUserId,
      partnerId: partner.id,
      scopes: partner.allowedScopes,
      embedded: true,
    };

    const access_token = this.jwtService.sign(payload, { expiresIn: '1h' });
    return { access_token };
  }

  async getPartnerUser(userId: string): Promise<PartnerUser | null> {
    return this.partnerUserRepo.findOne({
      where: { nexafxUserId: userId },
      relations: ['partner'],
    });
  }
}
