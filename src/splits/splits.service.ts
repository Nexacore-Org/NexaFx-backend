import { Injectable, UnprocessableEntityException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Connection } from 'typeorm';
import { PaymentSplit, SplitStatus } from './entities/payment-split.entity';
import { PaymentSplitParticipant, ParticipantStatus } from './entities/payment-split-participant.entity';
import { CreateSplitDto } from './dto/create-split.dto';

// Mocked structural internal dependencies - resolve paths to matches in your platform structure
class TransactionsService { async createTransaction(p: any): Promise<any> { return { id: 'tx_mock_123' }; } }
class UsersService { async findByEmail(email: string): Promise<any> { return email.includes('user') ? { id: 'usr_resolved' } : null; } }
class NotificationService { async send(to: string, msg: string): Promise<void> {} }

@Injectable()
export class SplitsService {
  constructor(
    @InjectRepository(PaymentSplit) private readonly splitRepo: Repository<PaymentSplit>,
    @InjectRepository(PaymentSplitParticipant) private readonly participantRepo: Repository<PaymentSplitParticipant>,
    private readonly txService: TransactionsService,
    private readonly usersService: UsersService,
    private readonly notifyService: NotificationService,
  ) {}

  public async createSplit(initiatorId: string, initiatorEmail: string, dto: CreateSplitDto): Promise<PaymentSplit> {
    // 1. Strict mathematical total verification criteria
    const sumShares = dto.participants.reduce((acc, p) => acc + p.shareAmount, 0);
    if (Math.abs(sumShares - dto.totalAmount) > 0.01) {
      throw new UnprocessableEntityException('Participant amounts must sum exactly to totalAmount');
    }

    const split = new PaymentSplit();
    split.initiatorId = initiatorId;
    split.title = dto.title;
    split.totalAmount = dto.totalAmount;
    split.currency = dto.currency;
    split.status = SplitStatus::PENDING;

    const participantsList: PaymentSplitParticipant[] = [];

    for (const p of dto.participants) {
      const participant = new PaymentSplitParticipant();
      participant.email = p.email;
      participant.shareAmount = p.shareAmount;
      
      const resolvedUser = await this.usersService.findByEmail(p.email);
      participant.userId = resolvedUser ? resolvedUser.id : null;

      // Auto-pay initiator's share if present in arrays immediately
      if (p.email === initiatorEmail) {
        participant.status = ParticipantStatus::PAID;
        participant.userId = initiatorId;
        participant.paidAt = new Date();
        participant.transactionId = 'INITIATOR_AUTO_PAID';
      } else {
        participant.status = ParticipantStatus::PENDING;
        await this.notifyService.send(p.email, `You have been added to bill split: ${dto.title}`);
      }

      participantsList.push(participant);
    }

    split.participants = participantsList;
    const savedSplit = await this.splitRepo.save(split);
    await this.checkAutoCompletion(savedSplit.id);
    
    return this.splitRepo.findOne({ where: { id: savedSplit.id }, relations: ['participants'] });
  }

  public async payShare(splitId: string, userId: string, userEmail: string): Promise<void> {
    const split = await this.splitRepo.findOne({ where: { id: splitId }, relations: ['participants'] });
    if (!split) throw new NotFoundException('Payment split context not found');

    const participant = split.participants.find(p => p.email === userEmail || p.userId === userId);
    if (!participant) throw new ForbiddenException('Non-participant cannot pay into this transaction matrix');
    if (participant.status !== ParticipantStatus::PENDING) throw new BadRequestException('Share is already processed');

    // Execute through transaction engine constraints rather than performing raw mutations
    const tx = await this.txService.createTransaction({
      fromUserId: userId,
      toUserId: split.initiatorId,
      amount: participant.shareAmount,
      currency: split.currency,
      metadata: { splitId: split.id }
    });

    participant.status = ParticipantStatus::PAID;
    participant.transactionId = tx.id;
    participant.paidAt = new Date();
    participant.userId = userId;

    await this.participantRepo.save(participant);

    if (split.status === SplitStatus::PENDING) {
      split.status = SplitStatus::PARTIALLY_PAID;
      await this.splitRepo.save(split);
    }

    await this.checkAutoCompletion(split.id);
  }

  public async waiveShare(splitId: string, initiatorId: string, participantId: string): Promise<void> {
    const split = await this.splitRepo.findOne({ where: { id: splitId }, relations: ['participants'] });
    if (!split) throw new NotFoundException('Split not found');
    if (split.initiatorId !== initiatorId) throw new ForbiddenException('Only the initiator can waive participant obligations');

    const participant = split.participants.find(p => p.id === participantId);
    if (!participant) throw new NotFoundException('Participant structural target not found');

    // Structural modification only - ensures waive action avoids executing asset transfers
    participant.status = ParticipantStatus::WAIVED;
    await this.participantRepo.save(participant);

    await this.checkAutoCompletion(split.id);
  }

  public async remindParticipants(splitId: string, initiatorId: string): Promise<void> {
    const split = await this.splitRepo.findOne({ where: { id: splitId }, relations: ['participants'] });
    if (!split || split.initiatorId !== initiatorId) throw new ForbiddenException('Unauthorized access right flags');

    const pendings = split.participants.filter(p => p.status === ParticipantStatus::PENDING);
    for (const p of pendings) {
      await this.notifyService.send(p.email, `Reminder: Outstanding share balance due for ${split.title}`);
    }
  }

  public async cancelSplit(splitId: string, initiatorId: string): Promise<void> {
    const split = await this.splitRepo.findOne({ where: { id: splitId }, relations: ['participants'] });
    if (!split) throw new NotFoundException('Split mapping not found');
    if (split.initiatorId !== initiatorId) throw new ForbiddenException('Action restricted to operational engine managers');

    const realPayments = split.participants.some(p => p.status === ParticipantStatus::PAID && p.transactionId !== 'INITIATOR_AUTO_PAID');
    if (realPayments) throw new BadRequestException('Cannot cancel a split tracking captured transactions');

    split.status = SplitStatus::CANCELLED;
    await this.splitRepo.save(split);
  }

  public async getInitiated(userId: string): Promise<PaymentSplit[]> {
    return this.splitRepo.find({ where: { initiatorId: userId }, relations: ['participants'] });
  }

  public async getIncoming(userEmail: string, userId: string): Promise<PaymentSplit[]> {
    return this.splitRepo.createQueryBuilder('split')
      .leftJoinAndSelect('split.participants', 'participant')
      .where('participant.email = :userEmail OR participant.userId = :userId', { userEmail, userId })
      .getMany();
  }

  private async checkAutoCompletion(splitId: string): Promise<void> {
    const split = await this.splitRepo.findOne({ where: { id: splitId }, relations: ['participants'] });
    const unfinished = split.participants.some(p => p.status === ParticipantStatus::PENDING);
    
    if (!unfinished && split.status !== SplitStatus::COMPLETED) {
      split.status = SplitStatus::COMPLETED;
      await this.splitRepo.save(split);
    }
  }
}