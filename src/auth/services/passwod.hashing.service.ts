import * as bcrypt from 'bcryptjs';
import { Injectable } from '@nestjs/common';

@Injectable()
export abstract class PasswordHashingService {
  abstract hashPassword(password: string): Promise<string>;
  abstract comparePassword(plainPassword: string, hashedPassword: string): Promise<boolean>;
}

@Injectable()
export class BcryptPasswordHashingService extends PasswordHashingService {
  public async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  public async comparePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
}
