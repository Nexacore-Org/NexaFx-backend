// Shim — provides UserService at the path imported by src/invoice/invoice.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class UserService {
  async findById(_id: number): Promise<{ email: string } | null> {
    return null;
  }
}
