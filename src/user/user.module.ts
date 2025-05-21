import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService } from './providers/user.service';
import { UserController } from './user.controller';
import { User } from './entities/user.entity';
import { FindUserByEmail } from './providers/find-user.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [UserService, FindUserByEmail],
  exports: [UserService],
})
export class UserModule {}
