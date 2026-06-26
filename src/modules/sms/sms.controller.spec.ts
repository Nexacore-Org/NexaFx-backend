import { Test, TestingModule } from '@nestjs/testing';
import { SmsController } from './sms.controller';
import { SmsService } from './sms.service';

describe('SmsController', () => {
  let controller: SmsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SmsController],
      providers: [{ provide: SmsService, useValue: { generateAndStoreOtp: jest.fn(async () => '123456') } }],
    }).compile();

    controller = module.get<SmsController>(SmsController);
  });

  it('returns a success payload when OTP is sent', async () => {
    const result = await controller.sendOtp({ user: { userId: 'u1' } } as any, { phoneNumber: '+2348012345678', purpose: 'phone-verify' });
    expect(result).toEqual(expect.objectContaining({ message: 'OTP sent successfully' }));
  });
});
