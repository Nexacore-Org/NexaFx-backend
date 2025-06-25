import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PasswordHashingService } from './passwod.hashing.service';

@Injectable()
export class BcryptPasswordHashingService extends PasswordHashingService {
  public async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  public async comparePassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
}
