import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  Between,
  ILike,
  MoreThanOrEqual,
  LessThanOrEqual,
} from 'typeorm';
import { User, UserRole } from '../users/user.entity';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../transactions/entities/transaction.entity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { UserQueryDto } from './dto/user-query.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { AdminTransactionQueryDto } from './dto/admin-transaction-query.dto';
import { PlatformMetricsDto } from './dto/platform-metrics.dto';
import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  subDays,
  format,
  eachDayOfInterval,
  parseISO,
} from 'date-fns';
import { MetricsQueryDto } from './dto/metrics-query.dto';
import * as csv from 'fast-csv';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async getPlatformMetrics(
    query: MetricsQueryDto = {},
  ): Promise<PlatformMetricsDto> {
    const { from, to } = query;
    const now = new Date();

    // Default to last 30 days if no range provided
    const fromDate = from ? parseISO(from) : subDays(now, 30);
    const toDate = to ? parseISO(to) : now;

    // Validate date range
    if (fromDate > toDate) {
      throw new BadRequestException('From date cannot be after to date');
    }

    // Prevent excessively large ranges
    const daysDiff = Math.ceil(
      (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysDiff > 365) {
      throw new BadRequestException('Date range cannot exceed 365 days');
    }

    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);

    // User Metrics
    const totalUsers = await this.userRepository.count();
    const usersToday = await this.userRepository.count({
      where: { createdAt: MoreThanOrEqual(todayStart) },
    });
    const usersWeek = await this.userRepository.count({
      where: { createdAt: MoreThanOrEqual(weekStart) },
    });
    const usersMonth = await this.userRepository.count({
      where: { createdAt: MoreThanOrEqual(monthStart) },
    });

    // Transaction Metrics
    const totalTransactions = await this.transactionRepository.count();
    const currentMonthTransactions = await this.transactionRepository.count({
      where: { createdAt: MoreThanOrEqual(monthStart) },
    });
    const pendingTransactions = await this.transactionRepository.count({
      where: { status: TransactionStatus.PENDING },
    });

    // Calculate Volumes
    const volumes = await this.calculateTransactionVolumes();

    // KYC Metrics (Placeholder for future implementation)
    // Assuming KycRecord entity exists and has status 'PENDING'
    // const pendingKyc = await this.kycRepository.count({ where: { status: 'PENDING' } });
    const pendingKyc = 0; // Placeholder

    // Time-series data
    const dailySignups = await this.getDailySignups(fromDate, toDate);
    const dailyTransactionVolumes = await this.getDailyTransactionVolumes(
      fromDate,
      toDate,
    );

    return {
      users: {
        total: totalUsers,
        today: usersToday,
        thisWeek: usersWeek,
        thisMonth: usersMonth,
      },
      transactions: {
        totalCount: totalTransactions,
        currentMonthCount: currentMonthTransactions,
        pendingCount: pendingTransactions,
        volumes,
      },
      kyc: {
        pendingReviews: pendingKyc,
      },
      dailySignups,
      dailyTransactionVolumes,
    };
  }

  private async calculateTransactionVolumes() {
    const result = {
      deposits: { NGN: 0, USD: 0 },
      withdrawals: { NGN: 0, USD: 0 },
    };

    const aggregated = await this.transactionRepository
      .createQueryBuilder('transaction')
      .select('transaction.type', 'type')
      .addSelect('transaction.currency', 'currency')
      .addSelect('SUM(transaction.amount)', 'total')
      .where('transaction.status = :status', {
        status: TransactionStatus.SUCCESS,
      })
      .groupBy('transaction.type')
      .addGroupBy('transaction.currency')
      .getRawMany();

    for (const record of aggregated) {
      const amount = parseFloat(record.total);
      if (record.type === TransactionType.DEPOSIT) {
        if (record.currency === 'NGN') result.deposits.NGN += amount;
        if (record.currency === 'USD') result.deposits.USD += amount;
      } else if (record.type === TransactionType.WITHDRAW) {
        if (record.currency === 'NGN') result.withdrawals.NGN += amount;
        if (record.currency === 'USD') result.withdrawals.USD += amount;
      }
    }

    return result;
  }

  private async getDailySignups(
    fromDate: Date,
    toDate: Date,
  ): Promise<{ date: string; count: number }[]> {
    const signups = await this.userRepository
      .createQueryBuilder('user')
      .select('DATE_TRUNC(\'day\', "createdAt")', 'date')
      .addSelect('COUNT(*)', 'count')
      .where('user.createdAt >= :fromDate', { fromDate })
      .andWhere('user.createdAt <= :toDate', { toDate })
      .groupBy('DATE_TRUNC(\'day\', "createdAt")')
      .orderBy('DATE_TRUNC(\'day\', "createdAt")', 'ASC')
      .getRawMany();

    // Fill in missing days with 0
    const allDays = eachDayOfInterval({ start: fromDate, end: toDate });
    const signupMap = new Map(
      signups.map((s) => [
        format(parseISO(s.date), 'yyyy-MM-dd'),
        parseInt(s.count),
      ]),
    );

    return allDays.map((day) => ({
      date: format(day, 'yyyy-MM-dd'),
      count: signupMap.get(format(day, 'yyyy-MM-dd')) || 0,
    }));
  }

  private async getDailyTransactionVolumes(
    fromDate: Date,
    toDate: Date,
  ): Promise<
    { date: string; depositVolume: number; withdrawalVolume: number }[]
  > {
    const volumes = await this.transactionRepository
      .createQueryBuilder('transaction')
      .select('DATE_TRUNC(\'day\', "createdAt")', 'date')
      .addSelect('transaction.type', 'type')
      .addSelect('SUM(CAST(transaction.amount AS DECIMAL))', 'volume')
      .where('transaction.status = :status', {
        status: TransactionStatus.SUCCESS,
      })
      .andWhere('transaction.createdAt >= :fromDate', { fromDate })
      .andWhere('transaction.createdAt <= :toDate', { toDate })
      .groupBy('DATE_TRUNC(\'day\', "createdAt")')
      .addGroupBy('transaction.type')
      .orderBy('DATE_TRUNC(\'day\', "createdAt")', 'ASC')
      .getRawMany();

    // Fill in missing days with 0
    const allDays = eachDayOfInterval({ start: fromDate, end: toDate });
    const volumeMap = new Map<
      string,
      { deposit: number; withdrawal: number }
    >();

    volumes.forEach((v) => {
      const date = format(parseISO(v.date), 'yyyy-MM-dd');
      if (!volumeMap.has(date)) {
        volumeMap.set(date, { deposit: 0, withdrawal: 0 });
      }
      const dayVolumes = volumeMap.get(date)!;
      const volume = parseFloat(v.volume);
      if (v.type === TransactionType.DEPOSIT) {
        dayVolumes.deposit += volume;
      } else if (v.type === TransactionType.WITHDRAW) {
        dayVolumes.withdrawal += volume;
      }
    });

    return allDays.map((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayVolumes = volumeMap.get(dateStr) || {
        deposit: 0,
        withdrawal: 0,
      };
      return {
        date: dateStr,
        depositVolume: dayVolumes.deposit,
        withdrawalVolume: dayVolumes.withdrawal,
      };
    });
  }

  async exportMetrics(query: MetricsQueryDto = {}): Promise<string> {
    const metrics = await this.getPlatformMetrics(query);
    const { dailySignups, dailyTransactionVolumes } = metrics;

    // Combine data for CSV
    const csvData = dailySignups.map((signup) => {
      const volume = dailyTransactionVolumes.find(
        (v) => v.date === signup.date,
      );
      return {
        date: signup.date,
        signups: signup.count,
        depositVolume: volume?.depositVolume || 0,
        withdrawalVolume: volume?.withdrawalVolume || 0,
      };
    });

    // Generate CSV
    const csvString = csv.writeToString(csvData, { headers: true });
    return csvString;
  }

  async getUsers(query: UserQueryDto) {
    const {
      page = 1,
      limit = 10,
      search,
      isVerified,
      role,
      startDate,
      endDate,
    } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.userRepository.createQueryBuilder('user');

    if (search) {
      queryBuilder.andWhere(
        '(user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (isVerified !== undefined) {
      queryBuilder.andWhere('user.isVerified = :isVerified', { isVerified });
    }

    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }

    if (startDate) {
      queryBuilder.andWhere('user.createdAt >= :startDate', { startDate });
    }

    if (endDate) {
      queryBuilder.andWhere('user.createdAt <= :endDate', { endDate });
    }

    queryBuilder.skip(skip).take(limit).orderBy('user.createdAt', 'DESC');

    const [users, total] = await queryBuilder.getManyAndCount();

    return {
      data: users.map((user) => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isVerified: user.isVerified,
        isSuspended: user.isSuspended,
        createdAt: user.createdAt,
        walletPublicKey: user.walletPublicKey,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserById(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['kycRecords', 'transactions'], // Load related data if needed
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateUserRole(
    id: string,
    updateDto: UpdateUserRoleDto,
    adminId: string,
  ) {
    const user = await this.getUserById(id);

    if (user.role === updateDto.role) {
      return user;
    }

    const oldRole = user.role;
    user.role = updateDto.role;
    await this.userRepository.save(user);

    await this.auditLogsService.logAuthEvent(
      adminId,
      AuditAction.ROLE_CHANGE,
      {
        targetUserId: id,
        oldRole,
        newRole: user.role,
      },
      true,
    );

    return user;
  }

  async suspendUser(id: string, adminId: string) {
    const user = await this.getUserById(id);

    if (user.isSuspended) {
      throw new BadRequestException('User is already suspended');
    }

    user.isSuspended = true;
    await this.userRepository.save(user);

    await this.auditLogsService.logAuthEvent(
      adminId,
      AuditAction.USER_SUSPENDED,
      { targetUserId: id },
      true,
    );

    return { message: 'User suspended successfully' };
  }

  async unsuspendUser(id: string, adminId: string) {
    const user = await this.getUserById(id);

    if (!user.isSuspended) {
      throw new BadRequestException('User is not suspended');
    }

    user.isSuspended = false;
    await this.userRepository.save(user);

    await this.auditLogsService.logAuthEvent(
      adminId,
      AuditAction.USER_UNSUSPENDED,
      { targetUserId: id },
      true,
    );

    return { message: 'User unsuspended successfully' };
  }

  async getTransactions(query: AdminTransactionQueryDto) {
    const {
      page = 1,
      limit = 10,
      type,
      status,
      currency,
      userId,
      startDate,
      endDate,
    } = query;
    const skip = (page - 1) * limit;

    const queryBuilder =
      this.transactionRepository.createQueryBuilder('transaction');

    if (type) {
      queryBuilder.andWhere('transaction.type = :type', { type });
    }

    if (status) {
      queryBuilder.andWhere('transaction.status = :status', { status });
    }

    if (currency) {
      queryBuilder.andWhere('transaction.currency = :currency', { currency });
    }

    if (userId) {
      queryBuilder.andWhere('transaction.userId = :userId', { userId });
    }

    if (startDate) {
      queryBuilder.andWhere('transaction.createdAt >= :startDate', {
        startDate,
      });
    }

    if (endDate) {
      queryBuilder.andWhere('transaction.createdAt <= :endDate', { endDate });
    }

    queryBuilder
      .leftJoinAndSelect('transaction.user', 'user') // Include user details
      .skip(skip)
      .take(limit)
      .orderBy('transaction.createdAt', 'DESC');

    const [transactions, total] = await queryBuilder.getManyAndCount();

    return {
      data: transactions,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
