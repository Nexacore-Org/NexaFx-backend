import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { ProfilePictureController } from './profile-picture.controller';
import { ProfilePictureService } from './profile-picture.service';
import { ProfilePicture } from './entities/profile-picture.entity';
import { multerConfig } from './config/multer.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProfilePicture]),
    MulterModule.register(multerConfig),
  ],
  controllers: [ProfilePictureController],
  providers: [ProfilePictureService],
  exports: [ProfilePictureService],
})
export class ProfilePictureModule {}
