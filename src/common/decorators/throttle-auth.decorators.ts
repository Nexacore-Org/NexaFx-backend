import { Throttle } from '@nestjs/throttler';

export const ThrottleAuth = () =>
    Throttle({
        default: { limit: 5, ttl: 60 }, // 5 requests per minute for auth
    });