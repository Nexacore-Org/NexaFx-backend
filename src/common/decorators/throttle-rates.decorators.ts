import { Throttle } from '@nestjs/throttler';

export const ThrottleRates = () =>
  Throttle({
    default: { limit: 30, ttl: 60 }, // 30 requests per minute for rates
  });
