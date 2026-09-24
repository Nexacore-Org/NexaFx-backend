import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Decimal from 'decimal.js';
import { Charity } from './entities/charity.entity';
import { DonationCampaign, CampaignStatus } from './entities/donation-campaign.entity';
import { Donation } from './entities/donation.entity';
import { CreateDonationDto, CreateCharityDto, CreateCampaignDto } from './dto/donations.dto';
import { StellarService } from '../modules/stellar/stellar.service';
import { WalletsService } from '../wallets/wallets.service';
import { MailService } from '../modules/mail/mail.service';
import { UsersService } from '../users/users.service';

const MIN_ROUNDUP = new Decimal('0.01');

@Injectable()
export class DonationsService {
  private readonly logger = new Logger(DonationsService.name);

  constructor(
    @InjectRepository(Charity) private readonly charityRepo: Repository<Charity>,
    @InjectRepository(DonationCampaign) private readonly campaignRepo: Repository<DonationCampaign>,
    @InjectRepository(Donation) private readonly donationRepo: Repository<Donation>,
    private readonly stellarService: StellarService,
    private readonly walletsService: WalletsService,
    private readonly mailService: MailService,
    private readonly usersService: UsersService,
  ) {}

  async donate(userId: string, dto: CreateDonationDto): Promise<Donation> {
    const campaign = await this.campaignRepo.findOne({
      where: { id: dto.campaignId, status: CampaignStatus.ACTIVE },
      relations: ['charity'],
    });
    if (!campaign) throw new NotFoundException('Campaign not found or inactive');
    if (!campaign.charity.isActive) throw new BadRequestException('Charity is not active');

    const amount = new Decimal(dto.amount);
    const wallet = await this.walletsService.resolveWalletForTransaction(userId);
    // Get balance from user balances
    const user = await this.usersService.findById(userId);
    const balance = new Decimal(String(user?.balances?.['XLM'] ?? '0'));
    if (balance.lessThan(amount)) throw new BadRequestException('Insufficient balance');

    const refNum = `DON-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    // Transfer XLM to charity Stellar wallet
    if (!wallet.encryptedSecretKey) throw new BadRequestException('Wallet is watch-only');
    await this.stellarService.sendPayment(
      wallet.encryptedSecretKey,
      campaign.charity.stellarWalletAddress,
      amount.toFixed(8),
      `DON-${refNum}`,
      userId,
    );

    const donation = await this.donationRepo.save(
      this.donationRepo.create({
        campaignId: campaign.id,
        userId: dto.anonymous ? null : userId,
        anonymous: dto.anonymous ?? false,
        amount: amount.toFixed(8),
        referenceNumber: refNum,
      }),
    );

    // Update campaign and charity totals
    await this.campaignRepo.increment({ id: campaign.id }, 'raisedAmount', amount.toNumber());
    await this.campaignRepo.increment({ id: campaign.id }, 'donorCount', 1);
    await this.charityRepo.increment({ id: campaign.charityId }, 'totalReceived', amount.toNumber());
    await this.charityRepo.increment({ id: campaign.charityId }, 'donorCount', 1);

    // Email receipt async
    this.sendReceipt(userId, donation, campaign).catch((e) =>
      this.logger.warn(`Donation receipt email failed: ${e.message}`),
    );

    return donation;
  }

  async processRoundUp(userId: string, transactionAmount: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    const prefs = (user as any).donationPreferences as { roundUpEnabled?: boolean; charityId?: string } | undefined;
    if (!prefs?.roundUpEnabled || !prefs.charityId) return;

    const charity = await this.charityRepo.findOne({ where: { id: prefs.charityId, isActive: true } });
    if (!charity) return;

    const amount = new Decimal(transactionAmount);
    const ceil = amount.ceil();
    const spare = ceil.minus(amount);
    if (spare.lessThan(MIN_ROUNDUP)) return;

    // Find or create an active campaign for this charity
    const campaign = await this.campaignRepo.findOne({
      where: { charityId: charity.id, status: CampaignStatus.ACTIVE },
    });
    if (!campaign) return;

    this.donate(userId, { campaignId: campaign.id, amount: spare.toFixed(8), anonymous: false }).catch(
      (e) => this.logger.warn(`Round-up donation failed: ${e.message}`),
    );
  }

  async listCharities(): Promise<Charity[]> {
    return this.charityRepo.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }

  async listCampaigns(): Promise<DonationCampaign[]> {
    return this.campaignRepo.find({
      where: { status: CampaignStatus.ACTIVE },
      relations: ['charity'],
      order: { createdAt: 'DESC' },
    });
  }

  async getCampaign(id: string): Promise<DonationCampaign & { recentDonors: object[] }> {
    const campaign = await this.campaignRepo.findOne({ where: { id }, relations: ['charity'] });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const recentDonations = await this.donationRepo.find({
      where: { campaignId: id },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const recentDonors = recentDonations.map((d) => ({
      amount: d.amount,
      anonymous: d.anonymous,
      donor: d.anonymous ? 'Anonymous donor' : d.userId,
      createdAt: d.createdAt,
    }));

    return { ...campaign, recentDonors };
  }

  async createCharity(dto: CreateCharityDto): Promise<Charity> {
    return this.charityRepo.save(this.charityRepo.create(dto));
  }

  async verifyCharity(id: string): Promise<Charity> {
    const charity = await this.charityRepo.findOne({ where: { id } });
    if (!charity) throw new NotFoundException('Charity not found');
    charity.isVerified = true;
    return this.charityRepo.save(charity);
  }

  async createCampaign(dto: CreateCampaignDto): Promise<DonationCampaign> {
    const charity = await this.charityRepo.findOne({ where: { id: dto.charityId } });
    if (!charity) throw new NotFoundException('Charity not found');
    return this.campaignRepo.save(this.campaignRepo.create(dto));
  }

  private async sendReceipt(userId: string, donation: Donation, campaign: DonationCampaign): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user?.email) return;
    await this.mailService.enqueueEmail({
      to: user.email,
      subject: `Donation Receipt — ${donation.referenceNumber}`,
      html: `<p>Thank you for your donation of ${donation.amount} XLM to <strong>${campaign.title}</strong>.</p>
             <p>Reference: <strong>${donation.referenceNumber}</strong></p>
             <p>This receipt may be used for tax deduction purposes.</p>`,
    });
  }
}
