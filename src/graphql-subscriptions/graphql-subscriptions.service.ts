import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface ExchangeRateUpdate {
  pair: string;
  rate: number;
  timestamp: number;
}

export interface TransactionStatusUpdate {
  transactionId: string;
  userId: string;
  status: string;
  updatedAt: number;
}

@Injectable()
export class GraphqlSubscriptionsService {
  private exchangeRateSubject = new Subject<ExchangeRateUpdate>();
  private transactionSubject = new Subject<TransactionStatusUpdate>();

  // Method called by existing gateways to push exchange rate updates
  public emitExchangeRate(update: ExchangeRateUpdate): void {
    this.exchangeRateSubject.next(update);
  }

  // Method called by transaction services when status changes
  public emitTransactionStatus(update: TransactionStatusUpdate): void {
    this.transactionSubject.next(update);
  }

  public getExchangeRateStream(pair: string): Observable<ExchangeRateUpdate> {
    return this.exchangeRateSubject.asObservable().pipe(
      filter((event) => event.pair === pair),
    );
  }

  public getTransactionStream(transactionId: string, userId: string): Observable<TransactionStatusUpdate> {
    return this.transactionSubject.asObservable().pipe(
      filter((event) => event.transactionId === transactionId && event.userId === userId),
    );
  }
}