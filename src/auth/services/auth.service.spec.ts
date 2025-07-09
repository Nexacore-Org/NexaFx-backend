import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: require('../../user/user.service').UserService,
          useValue: {},
        },
        { provide: require('@nestjs/jwt').JwtService, useValue: {} },
        {
          provide: require('./passwod.hashing.service')
            .BcryptPasswordHashingService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
