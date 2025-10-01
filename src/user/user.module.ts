import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService } from './providers/user.service';
import { UserController } from './user.controller';
import { User } from './entities/user.entity';
import { FindUserByEmail } from './providers/find-user.service';
import { FindUserByPhone } from './providers/find-user-by-phone.service';
import { AuthModule } from 'src/auth/auth.module';
import { ProfileProgressService } from './services/profile-progress.service';
import { DocumentUploadService } from './services/document-upload.service';
import { UserProfileListener } from './listeners/user-profile.listener';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { VerificationGuard } from './guards/verification.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    forwardRef(() => AuthModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [UserController],
  providers: [
    UserService,
    FindUserByEmail,
    FindUserByPhone,
    ProfileProgressService,
    DocumentUploadService,
    UserProfileListener,
    VerificationGuard,
  ],
  exports: [UserService, ProfileProgressService, VerificationGuard],
})
export class UserModule {}
