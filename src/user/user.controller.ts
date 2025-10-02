import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  Put,
  Post,
  UseGuards,
  Request,
  HttpStatus,
  HttpCode,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { UserService } from './providers/user.service';
// import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { JwtAuthGuard } from 'src/auth/guard/jwt.auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SendPhoneVerificationDto, ConfirmPhoneVerificationDto } from './dto/phone-verification.dto';
import { InitiateVerificationDto } from './dto/initiate-verification.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentUploadService } from './services/document-upload.service';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly documentUploadService: DocumentUploadService,
  ) {}

  //   @Post()
  //   @ApiOperation({ summary: 'Create a new user' })
  //   @ApiBody({ type: CreateUserDto, examples: { default: { value: { firstName: 'John', lastName: 'Doe', email: 'john.doe@example.com', accountType: 'Personal', password: 'StrongPassword123!', phoneNumber: '+1234567890', address: '123 Main St, City, Country', profilePicture: 'https://example.com/profile.jpg', bio: 'A short bio about the user.' } } } })
  //   @ApiResponse({ status: 201, description: 'User created', type: User })
  //   create(@Body() createUserDto: CreateUserDto): Promise<User> {
  //     return this.userService.create(createUserDto);
  //   }

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, description: 'List of users', type: [User] })
  findAll(): Promise<User[]> {
    return this.userService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by ID' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User details', type: User })
  findOne(@Param('id') id: string): Promise<User> {
    return this.userService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiBody({
    type: UpdateUserDto,
    examples: {
      default: {
        value: {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
          password: 'StrongNewPassword456!',
          phoneNumber: '+1987654321',
          address: '456 Main St, City, Country',
          profilePicture: 'https://example.com/profile2.jpg',
          bio: 'Updated bio for the user.',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'User updated', type: User })
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<User> {
    return this.userService.update(id, updateUserDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 204, description: 'User deleted' })
  remove(@Param('id') id: string): Promise<void> {
    return this.userService.remove(id);
  }

  // New profile & verification endpoints

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  async getProfile(@Request() req) {
    return this.userService.getProfile(req.user.id);
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or email update attempted' })
  async updateProfile(@Request() req, @Body() updateDto: UpdateProfileDto) {
    if ('email' in (updateDto as any)) {
      throw new BadRequestException('Email cannot be updated. This field is immutable.');
    }
    return this.userService.updateProfile(req.user.id, updateDto);
  }

  @Get('profile/required-fields')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get list of required fields for verification' })
  async getRequiredFields(@Request() req) {
    return this.userService.getRequiredFields(req.user.id);
  }

  @Post('verify-phone')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send phone verification code' })
  async sendPhoneVerification(@Request() req, @Body() dto: SendPhoneVerificationDto) {
    await this.userService.sendPhoneVerificationCode(req.user.id, dto.phoneNumber);
    return { message: 'Verification code sent successfully', phoneNumber: dto.phoneNumber };
  }

  @Post('confirm-phone')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm phone number with verification code' })
  async confirmPhoneVerification(@Request() req, @Body() dto: ConfirmPhoneVerificationDto) {
    const isValid = await this.userService.confirmPhoneVerification(req.user.id, dto.verificationCode);
    if (!isValid) {
      throw new BadRequestException('Invalid or expired verification code');
    }
    return { message: 'Phone number verified successfully', isPhoneVerified: true };
  }

  @Post('initiate-verification')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate user verification process' })
  async initiateVerification(@Request() req, @Body() dto: InitiateVerificationDto) {
    await this.userService.initiateVerification(req.user.id, dto);
    return { message: 'Verification request submitted successfully', status: 'pending' };
  }

  @Get('verification-status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get current verification status' })
  async getVerificationStatus(@Request() req) {
    return this.userService.getVerificationStatus(req.user.id);
  }

  @Post('upload-document')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload verification document' })
  async uploadDocument(@UploadedFile() file: Express.Multer.File) {
    const documentUrl = await this.documentUploadService.uploadDocument(file);
    return {
      message: 'Document uploaded successfully',
      url: documentUrl,
    };
  }
}
