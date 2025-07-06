import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  ParseUUIDPipe,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { ProfilePictureService } from './profile-picture.service';
import { UploadProfilePictureDto } from './dto/upload-profile-picture.dto';
import { ProfilePictureResponseDto } from './dto/profile-picture-response.dto';
import { multerConfig } from './config/multer.config';
import { Express } from 'express';

@ApiTags('Profile Pictures')
@Controller('profile-pictures')
export class ProfilePictureController {
  constructor(private readonly profilePictureService: ProfilePictureService) {}

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', multerConfig))
  @ApiOperation({ summary: 'Upload a profile picture' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        userId: { type: 'string', format: 'uuid' },
      },
    },
    examples: {
      default: {
        value: {
          file: '<binary>',
          userId: '123e4567-e89b-12d3-a456-426614174000',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Profile picture uploaded successfully',
    type: ProfilePictureResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async uploadProfilePicture(
    @UploadedFile('file') file: Express.Multer.File,
    @Body() uploadDto: UploadProfilePictureDto,
  ): Promise<ProfilePictureResponseDto> {
    return this.profilePictureService.uploadProfilePicture(file, uploadDto);
  }

  @Get('user/:userId/active')
  @ApiOperation({ summary: 'Get active profile picture for a user' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'Active profile picture retrieved successfully',
    type: ProfilePictureResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Profile picture not found' })
  async getActiveProfilePicture(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<ProfilePictureResponseDto> {
    return this.profilePictureService.getActiveProfilePicture(userId);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get all profile pictures for a user' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid', description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'Profile pictures retrieved successfully',
    type: [ProfilePictureResponseDto],
  })
  async getAllProfilePictures(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<ProfilePictureResponseDto[]> {
    return this.profilePictureService.getAllProfilePictures(userId);
  }

  @Delete(':id/user/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a profile picture' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Profile Picture ID' })
  @ApiParam({ name: 'userId', type: 'string', format: 'uuid', description: 'User ID' })
  @ApiResponse({ status: 204, description: 'Profile picture deleted successfully' })
  @ApiResponse({ status: 404, description: 'Profile picture not found' })
  async deleteProfilePicture(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    return this.profilePictureService.deleteProfilePicture(id, userId);
  }
}
