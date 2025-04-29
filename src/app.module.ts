import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
// Import your other modules
// import { AuthModule } from './auth/auth.module';
// import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    // Your other modules
    // AuthModule,
    // AdminModule,
    
    // Global throttler module configuration
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1 minute in milliseconds
      limit: 100, // 100 requests per minute
    }]),
  ],
  providers: [
 // Global guard application
 {
  provide: APP_GUARD,
  useClass: ThrottlerGuard,
},
],
})
export class AppModule {}

