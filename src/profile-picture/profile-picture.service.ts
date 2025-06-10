import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { ProfilePicture } from './entities/profile-picture.entity';
import { UploadProfilePictureDto } from './dto/upload-profile-picture.dto';
import { ProfilePictureResponseDto } from './dto/profile-picture-response.dto';
import * as fs from 'fs';
import * as path from 'path';
import { Express } from 'express';

@Injectable()
export class ProfilePictureService {
  constructor(
    private readonly profilePictureRepository: Repository<ProfilePicture>,
  ) {}

  async uploadProfilePicture(
    file: Express.Multer.File,
    uploadDto: UploadProfilePictureDto,
  ): Promise<ProfilePictureResponseDto> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    try {
      // Deactivate previous profile pictures for this user
      await this.deactivatePreviousProfilePictures(uploadDto.userId);

      // Create file URL (adjust based on your server configuration)
      const fileUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/uploads/profile-pictures/${file.filename}`;

      // Create new profile picture record
      const profilePicture = this.profilePictureRepository.create({
        userId: uploadDto.userId,
        fileName: file.filename,
        originalName: file.originalname,
        fileUrl,
        fileSize: file.size,
        mimeType: file.mimetype,
        isActive: true,
      });

      const savedProfilePicture =
        await this.profilePictureRepository.save(profilePicture);

      return this.mapToResponseDto(savedProfilePicture);
    } catch (error) {
      // Clean up uploaded file if database operation fails
      if (file && file.path) {
        this.deleteFile(file.path);
      }
      throw new InternalServerErrorException(
        'Failed to upload profile picture',
      );
    }
  }

  async getActiveProfilePicture(
    userId: string,
  ): Promise<ProfilePictureResponseDto> {
    const profilePicture = await this.profilePictureRepository.findOne({
      where: { userId, isActive: true },
      order: { createdAt: 'DESC' },
    });

    if (!profilePicture) {
      throw new NotFoundException('No active profile picture found');
    }

    return this.mapToResponseDto(profilePicture);
  }

  async getAllProfilePictures(
    userId: string,
  ): Promise<ProfilePictureResponseDto[]> {
    const profilePictures = await this.profilePictureRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return profilePictures.map((pp) => this.mapToResponseDto(pp));
  }

  async deleteProfilePicture(id: string, userId: string): Promise<void> {
    const profilePicture = await this.profilePictureRepository.findOne({
      where: { id, userId },
    });

    if (!profilePicture) {
      throw new NotFoundException('Profile picture not found');
    }

    // Delete file from filesystem
    const filePath = path.join(
      process.cwd(),
      'uploads',
      'profile-pictures',
      profilePicture.fileName,
    );
    this.deleteFile(filePath);

    // Delete from database
    await this.profilePictureRepository.remove(profilePicture);
  }

  private async deactivatePreviousProfilePictures(
    userId: string,
  ): Promise<void> {
    await this.profilePictureRepository.update(
      { userId, isActive: true },
      { isActive: false },
    );
  }

  private deleteFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  }

  private mapToResponseDto(
    profilePicture: ProfilePicture,
  ): ProfilePictureResponseDto {
    return {
      id: profilePicture.id,
      userId: profilePicture.userId,
      fileName: profilePicture.fileName,
      originalName: profilePicture.originalName,
      fileUrl: profilePicture.fileUrl,
      fileSize: profilePicture.fileSize,
      mimeType: profilePicture.mimeType,
      isActive: profilePicture.isActive,
      createdAt: profilePicture.createdAt,
      updatedAt: profilePicture.updatedAt,
    };
  }
}
