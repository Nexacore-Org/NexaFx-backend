import { Test, TestingModule } from '@nestjs/testing';
import { OpenidConnectService } from './openid-connect.service';
import { UnauthorizedException } from '@nestjs/common';

describe('OpenidConnectService', () => {
  let service: OpenidConnectService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OpenidConnectService],
    }).compile();

    service = module.get<OpenidConnectService>(OpenidConnectService);
  });

  it('should generate an authorization code', () => {
    const code = service.generateAuthorizationCode({
      client_id: 'test-client',
      redirect_uri: 'http://localhost/cb',
      response_type: 'code',
      scope: 'openid profile kyc',
    }, 'user123');
    
    expect(code).toBeDefined();
    expect(code.length).toBe(32);
  });

  it('should exchange a valid code for tokens', () => {
    const code = service.generateAuthorizationCode({
      client_id: 'test-client',
      redirect_uri: 'http://localhost/cb',
      response_type: 'code',
      scope: 'openid profile kyc',
    }, 'user123');
    
    const tokens = service.exchangeCodeForTokens({
      grant_type: 'authorization_code',
      code: code,
      client_id: 'test-client',
      client_secret: 'secret',
      redirect_uri: 'http://localhost/cb'
    });
    
    expect(tokens.access_token).toBeDefined();
    expect(tokens.id_token).toBeDefined();
  });

  it('should throw UnauthorizedException on invalid code', () => {
    expect(() => service.exchangeCodeForTokens({
      grant_type: 'authorization_code',
      code: 'invalid',
      client_id: 'test-client',
      client_secret: 'secret',
      redirect_uri: 'http://localhost/cb'
    })).toThrow(UnauthorizedException);
  });
});
