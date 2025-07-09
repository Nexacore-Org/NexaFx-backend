import {
  Injectable,
  RequestTimeoutException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Injectable()
export class FindUserByPhone {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  public async FindByPhone(phoneNumber: string) {
    let user: User | null;

    try {
      user = await this.userRepository.findOneBy({ phoneNumber });
    } catch (error) {
      throw new RequestTimeoutException(error, {
        description: 'Could not fetch the User',
      });
    }

    if (!user) {
      throw new UnauthorizedException('User does not exist');
    }

    return user;
  }
  public async FindByPhoneOptional(phone: string): Promise<User | null> {
    try {
      return await this.userRepository.findOneBy({ phoneNumber: phone });
    } catch (error) {
      throw new RequestTimeoutException(error, {
        description: 'Could not fetch the User',
      });
    }
  }
}
