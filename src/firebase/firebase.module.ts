import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FirebaseService } from './firebase.service';
import { FCMService } from './fcm.service';
import { User } from '../users/user.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [FirebaseService, FCMService],
  exports: [FirebaseService, FCMService],
})
export class FirebaseModule {}
