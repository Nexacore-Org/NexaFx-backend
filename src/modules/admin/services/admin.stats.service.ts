
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from 'src/transactions/entities/transaction.entity';
import { User } from 'src/user/entities/user.entity';
import { Currency } from 'src/currencies/entities/currency.entity';
import { OverviewStatsDto } from '../dto/overview-stats.dto';
import { TopCurrencyDto } from '../dto/top-currency.dto';
import { UserStatsDto } from '../dto/user-stats.dto';

@Injectable()
export class AdminStatsService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Currency)
    private currencyRepository: Repository<Currency>,
  ) {}

  async getOverviewStats(): Promise<OverviewStatsDto> {
    // Get total transactions count
    const totalTransactions = await this.transactionRepository.count();

    // Get revenue (sum of all transaction amounts)
    const revenueResult = await this.transactionRepository
      .createQueryBuilder('transaction')
      .select('SUM(transaction.amount)', 'totalRevenue')
      .getRawOne();
    
    const totalRevenue = revenueResult.totalRevenue || 0;

    // Get total users count
    const totalUsers = await this.userRepository.count();

    // Get transactions in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentTransactions = await this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.createdAt >= :thirtyDaysAgo', { thirtyDaysAgo })
      .getCount();

    return {
      totalTransactions,
      totalRevenue,
      totalUsers,
      recentTransactions,
      lastUpdated: new Date()
    };
  }

  async getTopCurrencies(): Promise<TopCurrencyDto[]> {
    // Get top 5 currencies by transaction volume
    const topCurrencies = await this.transactionRepository
      .createQueryBuilder('transaction')
      .select('transaction.currencyId', 'currencyId')
      .addSelect('COUNT(transaction.id)', 'transactionCount')
      .addSelect('SUM(transaction.amount)', 'totalVolume')
      .leftJoin('transaction.currency', 'currency')
      .addSelect('currency.name', 'currencyName')
      .addSelect('currency.code', 'currencyCode')
      .groupBy('transaction.currencyId')
      .addGroupBy('currency.name')
      .addGroupBy('currency.code')
      .orderBy('totalVolume', 'DESC')
      .limit(5)
      .getRawMany();
    
    return topCurrencies.map(currency => ({
      id: currency.currencyId,
      name: currency.currencyName,
      code: currency.currencyCode,
      transactionCount: parseInt(currency.transactionCount, 10),
      totalVolume: parseFloat(currency.totalVolume)
    }));
  }

  async getUserStats(): Promise<UserStatsDto> {
    // Get total users
    const totalUsers = await this.userRepository.count();

    // Get new users in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const newUsers = await this.userRepository
      .createQueryBuilder('user')
      .where('user.createdAt >= :thirtyDaysAgo', { thirtyDaysAgo })
      .getCount();

    // Calculate monthly growth rate
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    
    const previousMonthUsers = await this.userRepository
      .createQueryBuilder('user')
      .where('user.createdAt >= :sixtyDaysAgo AND user.createdAt < :thirtyDaysAgo', { 
        sixtyDaysAgo, 
        thirtyDaysAgo 
      })
      .getCount();

    // Calculate growth rate (handle division by zero)
    let growthRate = 0;
    if (previousMonthUsers > 0) {
      growthRate = ((newUsers - previousMonthUsers) / previousMonthUsers) * 100;
    } else if (newUsers > 0) {
      growthRate = 100; // If there were no users before but there are now, that's 100% growth
    }

    // Get active users (users with transactions in the last 30 days)
    const activeUsers = await this.transactionRepository
      .createQueryBuilder('transaction')
      .select('COUNT(DISTINCT transaction.userId)', 'activeUserCount')
      .where('transaction.createdAt >= :thirtyDaysAgo', { thirtyDaysAgo })
      .getRawOne();

    return {
      totalUsers,
      newUsers,
      growthRate,
      activeUsers: parseInt(activeUsers.activeUserCount, 10),
      lastUpdated: new Date()
    };
  }
}