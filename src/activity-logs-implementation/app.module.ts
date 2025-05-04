// **src/app.module.ts** (partial)

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLogsModule } from './activity-logs/activity-logs.module';
// ... other imports

@Module({
  imports: [
    // ... other modules
    TypeOrmModule.forRoot({
      // ... database configuration
      entities: [/* ... other entities */],
    }),
    ActivityLogsModule,
    // ... other modules
  ],
  // ... other module configuration
})
export class AppModule {}