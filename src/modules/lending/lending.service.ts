import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { LendingOffer, LendingOfferStatus } from './entities/lending-offer.entity';
import { LendingAgreement, AgreementStatus } from './entities/lending-agreement.entity';
import { WalletsService } from '../wallets/wallets.service';
import { UsersService } from '../users/users.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class LendingService {
  constructor(
    @InjectRepository(LendingOffer)
    private readonly offerRepo: Repository<LendingOffer>,
    @InjectRepository(LendingAgreement)
    private readonly agreementRepo: Repository<LendingAgreement>,
    private readonly walletsService: WalletsService,
    private readonly usersService: UsersService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async listOffers(filters?: { maxRate?: number; minAmount?: number; maxTerm?: number }): Promise<LendingOffer[]> {
    const qb = this.offerRepo.createQueryBuilder('offer');
    qb.where('offer.status = :status', { status: LendingOfferStatus.OPEN });
    qb.andWhere('offer.expiresAt > NOW()');

    if (filters?.maxRate !== undefined) {
      qb.andWhere('offer.annualInterestRate <= :maxRate', { maxRate: filters.maxRate });
    }
    if (filters?.minAmount !== undefined) {
      qb.andWhere('offer.amount >= :minAmount', { minAmount: filters.minAmount });
    }
    if (filters?.maxTerm !== undefined) {
      qb.andWhere('offer.termDays <= :maxTerm', { maxTerm: filters.maxTerm });
    }

    qb.orderBy('offer.annualInterestRate', 'ASC');
    return qb.getMany();
  }

  async createOffer(
    lenderId: string,
    dto: { amount: string; currency?: string; annualInterestRate: string; termDays: number; minBorrowerScore?: number },
  ): Promise<LendingOffer> {
    const user = await this.usersService.findOne(lenderId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.kycLevel !== 'ENHANCED') {
      throw new ForbiddenException('ENHANCED KYC required to create lending offers');
    }

    const wallet = await this.walletsService.findByUserAndCurrency(lenderId, dto.currency || 'XLM');
    if (!wallet) {
      throw new BadRequestException('No wallet found for the specified currency');
    }

    const availableBalance = parseFloat(wallet.balance) - parseFloat(wallet.reservedBalance || '0');
    if (availableBalance < parseFloat(dto.amount)) {
      throw new BadRequestException('Insufficient available balance');
    }

    wallet.reservedBalance = String(
      parseFloat(wallet.reservedBalance || '0') + parseFloat(dto.amount),
    );
    await this.walletsService.update(wallet.id, { reservedBalance: wallet.reservedBalance });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const offer = this.offerRepo.create({
      lenderId,
      amount: dto.amount,
      currency: dto.currency || 'XLM',
      annualInterestRate: dto.annualInterestRate,
      termDays: dto.termDays,
      minBorrowerScore: dto.minBorrowerScore || 0,
      status: LendingOfferStatus.OPEN,
      expiresAt,
    });

    await this.auditLogsService.log({
      userId: lenderId,
      action: 'LENDING_OFFER_CREATED',
      details: { offerId: offer.id, amount: dto.amount },
    });

    return this.offerRepo.save(offer);
  }

  async acceptOffer(offerId: string, borrowerId: string): Promise<LendingAgreement> {
    const offer = await this.offerRepo.findOne({ where: { id: offerId } });
    if (!offer) {
      throw new NotFoundException('Lending offer not found');
    }
    if (offer.status !== LendingOfferStatus.OPEN) {
      throw new BadRequestException('Offer is not open');
    }
    if (offer.expiresAt <= new Date()) {
      throw new BadRequestException('Offer has expired');
    }
    if (offer.lenderId === borrowerId) {
      throw new BadRequestException('Cannot accept your own offer');
    }

    const borrower = await this.usersService.findOne(borrowerId);
    if (!borrower) {
      throw new NotFoundException('Borrower not found');
    }

    if ((borrower.financialHealthScore || 0) < offer.minBorrowerScore) {
      throw new ForbiddenException(
        `Borrower score ${borrower.financialHealthScore} does not meet minimum ${offer.minBorrowerScore}`,
      );
    }

    const principal = parseFloat(offer.amount);
    const rate = parseFloat(offer.annualInterestRate);
    const interestAmount = principal * rate * offer.termDays / 365;
    const platformFee = principal * 0.01;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + offer.termDays);

    const agreement = this.agreementRepo.create({
      offerId,
      borrowerId,
      principalAmount: offer.amount,
      interestAmount: interestAmount.toFixed(8),
      platformFee: platformFee.toFixed(8),
      status: AgreementStatus.ACTIVE,
      disbursedAt: new Date(),
      dueDate,
    });

    await this.walletsService.transfer(
      offer.lenderId,
      borrowerId,
      offer.amount,
      offer.currency || 'XLM',
    );

    offer.status = LendingOfferStatus.MATCHED;
    await this.offerRepo.save(offer);

    await this.auditLogsService.log({
      userId: borrowerId,
      action: 'LENDING_OFFER_ACCEPTED',
      details: { offerId, agreementId: agreement.id, borrowerId },
    });

    return this.agreementRepo.save(agreement);
  }

  async repayLoan(agreementId: string): Promise<LendingAgreement> {
    const agreement = await this.agreementRepo.findOne({
      where: { id: agreementId },
      relations: ['offer'],
    });
    if (!agreement) {
      throw new NotFoundException('Agreement not found');
    }
    if (agreement.status !== AgreementStatus.ACTIVE) {
      throw new BadRequestException('Agreement is not active');
    }

    const repaymentAmount = (
      parseFloat(agreement.principalAmount) + parseFloat(agreement.interestAmount)
    ).toFixed(8);

    const offer = agreement.offer;
    const lenderCurrency = offer.currency || 'XLM';

    await this.walletsService.transfer(
      agreement.borrowerId,
      offer.lenderId,
      repaymentAmount,
      lenderCurrency,
    );

    const platformFee = parseFloat(agreement.platformFee);
    if (platformFee > 0) {
      await this.walletsService.transferPlatformFee(
        agreement.borrowerId,
        agreement.platformFee,
        lenderCurrency,
      );
    }

    const lenderWallet = await this.walletsService.findByUserAndCurrency(
      offer.lenderId,
      lenderCurrency,
    );
    if (lenderWallet) {
      lenderWallet.reservedBalance = String(
        Math.max(0, parseFloat(lenderWallet.reservedBalance || '0') - parseFloat(offer.amount)),
      );
      await this.walletsService.update(lenderWallet.id, {
        reservedBalance: lenderWallet.reservedBalance,
      });
    }

    agreement.status = AgreementStatus.REPAID;
    offer.status = LendingOfferStatus.COMPLETED;

    await this.offerRepo.save(offer);

    await this.auditLogsService.log({
      userId: agreement.borrowerId,
      action: 'LENDING_LOAN_REPAID',
      details: { agreementId, repaymentAmount },
    });

    return this.agreementRepo.save(agreement);
  }

  @Cron('0 0 * * *')
  async checkDefaults(): Promise<void> {
    const overdueAgreements = await this.agreementRepo.find({
      where: {
        status: AgreementStatus.ACTIVE,
        dueDate: LessThanOrEqual(new Date()),
      },
    });

    for (const agreement of overdueAgreements) {
      agreement.status = AgreementStatus.DEFAULTED;
      await this.agreementRepo.save(agreement);

      await this.auditLogsService.log({
        userId: agreement.borrowerId,
        action: 'LENDING_LOAN_DEFAULTED',
        details: { agreementId: agreement.id },
      });
    }
  }

  async getMyOffers(lenderId: string): Promise<LendingOffer[]> {
    return this.offerRepo.find({
      where: { lenderId },
      order: { createdAt: 'DESC' },
    });
  }

  async getMyAgreements(userId: string): Promise<LendingAgreement[]> {
    return this.agreementRepo
      .createQueryBuilder('agreement')
      .where('agreement.borrowerId = :userId OR agreement.offerId IN (SELECT id FROM lending_offers WHERE lenderId = :userId)', { userId })
      .orderBy('agreement.createdAt', 'DESC')
      .getMany();
  }
}
