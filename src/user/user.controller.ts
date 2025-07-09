import {
  Controller,
  Get,
  // Post,
  Body,
  Patch,
  Param,
  Delete,
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

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

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
}
