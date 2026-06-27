import { Injectable, ForbiddenException, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { VirtualCard, CardStatus } from './entities/virtual-card.entity';
import { User } from '../users/user.entity';
import { KycRecord, KycStatus } from '../kyc/entities/kyc.entity';
import { Transaction, TransactionType, TransactionStatus } from '../transactions/entities/transaction.entity';
import { UsersService } from '../users/users.service';
import { UpdateCardControlsDto } from './dto/update-card-controls.dto';

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);
  private stripe: Stripe;

  constructor(
    @InjectRepository(VirtualCard)
    private virtualCardRepository: Repository<VirtualCard>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(KycRecord)
    private kycRecordRepository: Repository<KycRecord>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    this.stripe = new Stripe(this.configService.get<string>('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2025-02-24.acacia',
    });
  }

  private async checkUserKycApproved(userId: string): Promise<void> {
    const kycRecord = await this.kycRecordRepository.findOne({
      where: { userId, status: KycStatus.APPROVED },
    });
    if (!kycRecord) {
      throw new ForbiddenException('KYC must be approved to create a card');
    }
  }

  private async getOrCreateStripeCardholder(user: User): Promise<string> {
    if (user.stripeCardholderId) {
      return user.stripeCardholderId;
    }

    const kycRecord = await this.kycRecordRepository.findOne({
      where: { userId: user.id, status: KycStatus.APPROVED },
    });
    if (!kycRecord) {
      throw new ForbiddenException('KYC must be approved to create a card');
    }

    const cardholder = await this.stripe.issuing.cardholders.create({
      type: 'individual',
      name: kycRecord.fullName,
      email: user.email,
      phone_number: user.phone || undefined,
      individual: {
        first_name: user.firstName || '',
        last_name: user.lastName || '',
        dob: {
          day: kycRecord.dateOfBirth.getDate(),
          month: kycRecord.dateOfBirth.getMonth() + 1,
          year: kycRecord.dateOfBirth.getFullYear(),
        },
      },
      status: 'active',
    });

    user.stripeCardholderId = cardholder.id;
    await this.userRepository.save(user);

    return cardholder.id;
  }

  async createCard(userId: string): Promise<VirtualCard> {
    await this.checkUserKycApproved(userId);

    const existingCard = await this.virtualCardRepository.findOne({
      where: { userId, status: CardStatus.ACTIVE },
    });
    if (existingCard) {
      throw new BadRequestException('User already has an active card');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const cardholderId = await this.getOrCreateStripeCardholder(user);

    const stripeCard = await this.stripe.issuing.cards.create({
      cardholder: cardholderId,
      currency: 'usd',
      type: 'virtual',
      status: 'active',
    });

    const card = this.virtualCardRepository.create({
      userId,
      stripeCardId: stripeCard.id,
      last4: stripeCard.last4,
      expMonth: String(stripeCard.exp_month),
      expYear: String(stripeCard.exp_year),
      brand: stripeCard.brand,
      status: CardStatus.ACTIVE,
    });

    return this.virtualCardRepository.save(card);
  }

  async getCards(userId: string): Promise<VirtualCard[]> {
    return this.virtualCardRepository.find({ where: { userId } });
  }

  async getCardById(cardId: string, userId: string): Promise<VirtualCard> {
    const card = await this.virtualCardRepository.findOne({
      where: { id: cardId, userId },
    });
    if (!card) {
      throw new NotFoundException('Card not found');
    }
    return card;
  }

  async revealCard(cardId: string, userId: string): Promise<{ ephemeralKey: string }> {
    const card = await this.getCardById(cardId, userId);

    const ephemeralKey = await this.stripe.ephemeralKeys.create(
      { issuing_card: card.stripeCardId },
      { apiVersion: '2025-02-24.acacia' },
    );

    return { ephemeralKey: ephemeralKey.secret };
  }

  async freezeCard(cardId: string, userId: string): Promise<VirtualCard> {
    const card = await this.getCardById(cardId, userId);

    await this.stripe.issuing.cards.update(card.stripeCardId, {
      status: 'inactive',
    });

    card.status = CardStatus.FROZEN;
    return this.virtualCardRepository.save(card);
  }

  async unfreezeCard(cardId: string, userId: string): Promise<VirtualCard> {
    const card = await this.getCardById(cardId, userId);

    await this.stripe.issuing.cards.update(card.stripeCardId, {
      status: 'active',
    });

    card.status = CardStatus.ACTIVE;
    return this.virtualCardRepository.save(card);
  }

  async cancelCard(cardId: string, userId: string): Promise<void> {
    const card = await this.getCardById(cardId, userId);

    await this.stripe.issuing.cards.update(card.stripeCardId, {
      status: 'canceled',
    });

    card.status = CardStatus.CANCELLED;
    await this.virtualCardRepository.save(card);
  }

  async updateCardControls(
    cardId: string,
    userId: string,
    dto: UpdateCardControlsDto,
  ): Promise<VirtualCard> {
    const card = await this.getCardById(cardId, userId);

    const updateData: any = {};
    if (dto.spendLimit !== undefined) {
      updateData.spending_controls = {
        spending_limits: [
          {
            amount: Math.round(parseFloat(dto.spendLimit) * 100),
            currency: 'usd',
            interval: 'all_time',
          },
        ],
      };
    }

    if (dto.blockedMccs !== undefined) {
      updateData.spending_controls = {
        ...updateData.spending_controls,
        blocked_merchant_categories: dto.blockedMccs,
      };
    }

    if (Object.keys(updateData).length > 0) {
      await this.stripe.issuing.cards.update(card.stripeCardId, updateData);
    }

    if (dto.spendLimit !== undefined) {
      card.spendLimit = dto.spendLimit;
    }
    if (dto.blockedMccs !== undefined) {
      card.blockedMccs = dto.blockedMccs;
    }

    return this.virtualCardRepository.save(card);
  }

  async getCardTransactions(cardId: string, userId: string): Promise<Transaction[]> {
    const card = await this.getCardById(cardId, userId);
    return this.transactionRepository.find({
      where: {
        userId,
        metadata: { cardId: card.id },
      },
      order: { createdAt: 'DESC' },
    });
  }

  async handleStripeWebhook(
    body: Buffer,
    signature: string,
  ): Promise<void> {
    const webhookSecret = this.configService.get<string>('STRIPE_CARDS_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new BadRequestException('Webhook secret not configured');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        body,
        signature,
        webhookSecret,
      );
    } catch (err) {
      throw new BadRequestException('Invalid webhook signature');
    }

    switch (event.type) {
      case 'issuing_authorization.request': {
        const authorization = event.data.object as Stripe.Issuing.Authorization;
        await this.handleAuthorizationRequest(authorization);
        break;
      }
      case 'issuing_transaction.created': {
        const transaction = event.data.object as Stripe.Issuing.Transaction;
        await this.handleTransactionCreated(transaction);
        break;
      }
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
  }

  private async handleAuthorizationRequest(
    authorization: Stripe.Issuing.Authorization,
  ): Promise<void> {
    const card = await this.virtualCardRepository.findOne({
      where: { stripeCardId: authorization.card.id },
    });
    if (!card) {
      await this.stripe.issuing.authorizations.decline(authorization.id);
      return;
    }

    const user = await this.userRepository.findOne({ where: { id: card.userId } });
    if (!user) {
      await this.stripe.issuing.authorizations.decline(authorization.id);
      return;
    }

    const usdBalance = user.balances?.USD || 0;
    const authorizationAmount = authorization.amount / 100;

    if (usdBalance < authorizationAmount) {
      await this.stripe.issuing.authorizations.decline(authorization.id);
      return;
    }

    await this.stripe.issuing.authorizations.approve(authorization.id);
  }

  private async handleTransactionCreated(
    stripeTransaction: Stripe.Issuing.Transaction,
  ): Promise<void> {
    const card = await this.virtualCardRepository.findOne({
      where: { stripeCardId: stripeTransaction.card.id },
    });
    if (!card) {
      return;
    }

    const existingTransaction = await this.transactionRepository.findOne({
      where: {
        userId: card.userId,
        metadata: { stripeTransactionId: stripeTransaction.id },
      },
    });
    if (existingTransaction) {
      return;
    }

    const amount = stripeTransaction.amount / 100;
    const currency = stripeTransaction.currency.toUpperCase();

    // Update user balance
    const user = await this.usersService.findById(card.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.balances ??= {};

    const currentBalance = parseFloat(
      user.balances[currency]?.toString() ?? '0',
    );

    const newBalance = currentBalance - amount;

    if (newBalance < 0) {
      throw new BadRequestException('Insufficient balance');
    }

    user.balances[currency] = newBalance;

    await this.usersService.updateByUserId(card.userId, {
      balances: user.balances,
    });

    // Create transaction record
    const transaction = this.transactionRepository.create({
      userId: card.userId,
      type: TransactionType.WITHDRAW,
      amount: amount.toString(),
      currency,
      status: TransactionStatus.SUCCESS,
      metadata: { stripeTransactionId: stripeTransaction.id, cardId: card.id },
    });

    await this.transactionRepository.save(transaction);
  }
}
