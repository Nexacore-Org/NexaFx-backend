import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';

@Module({
    imports: [
        ThrottlerModule.forRootAsync({
            useFactory: (config: ConfigService) => ({
                ttl: config.get('THROTTLE_TTL') || 60, // Time-to-live in seconds
                limit: config.get('THROTTLE_LIMIT') || 100, // Max requests per TTL
            }),
            inject: [ConfigService],
        }),
    ],
    exports: [ThrottlerModule],
})
export class NestjsThrottlerModule { }