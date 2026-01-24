import { Injectable } from '@nestjs/common';

@Injectable()
export class DateService {
  /**
   * Get current date in ISO format
   */
  getCurrentDate(): string {
    return new Date().toISOString();
  }

  /**
   * Format date to ISO string
   */
  formatToISO(date: Date): string {
    return date.toISOString();
  }

  /**
   * Add days to a date
   */
  addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * Add hours to a date
   */
  addHours(date: Date, hours: number): Date {
    const result = new Date(date);
    result.setHours(result.getHours() + hours);
    return result;
  }

  /**
   * Add minutes to a date
   */
  addMinutes(date: Date, minutes: number): Date {
    const result = new Date(date);
    result.setMinutes(result.getMinutes() + minutes);
    return result;
  }

  /**
   * Check if a date is in the past
   */
  isPast(date: Date): boolean {
    return date < new Date();
  }

  /**
   * Check if a date is in the future
   */
  isFuture(date: Date): boolean {
    return date > new Date();
  }

  /**
   * Get difference in milliseconds between two dates
   */
  getDifferenceInMs(date1: Date, date2: Date): number {
    return Math.abs(date1.getTime() - date2.getTime());
  }

  /**
   * Get difference in minutes between two dates
   */
  getDifferenceInMinutes(date1: Date, date2: Date): number {
    return Math.floor(this.getDifferenceInMs(date1, date2) / (1000 * 60));
  }

  /**
   * Get difference in hours between two dates
   */
  getDifferenceInHours(date1: Date, date2: Date): number {
    return Math.floor(this.getDifferenceInMs(date1, date2) / (1000 * 60 * 60));
  }

  /**
   * Get difference in days between two dates
   */
  getDifferenceInDays(date1: Date, date2: Date): number {
    return Math.floor(
      this.getDifferenceInMs(date1, date2) / (1000 * 60 * 60 * 24),
    );
  }
}
