import { Test, TestingModule } from '@nestjs/testing';
import { CanaryFieldInterceptor } from '../canary-field.interceptor';
import { CanaryService } from '../../services/canary.service';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

describe('CanaryFieldInterceptor', () => {
  let interceptor: CanaryFieldInterceptor;
  let canaryService: CanaryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CanaryFieldInterceptor,
        {
          provide: CanaryService,
          useValue: {
            registerDynamicCanary: jest.fn(),
          },
        },
      ],
    }).compile();

    interceptor = module.get<CanaryFieldInterceptor>(CanaryFieldInterceptor);
    canaryService = module.get<CanaryService>(CanaryService);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should inject a canary token into the response', async () => {
    const honeyTokenEmail = 'canary@test.com';
    jest
      .spyOn(canaryService, 'registerDynamicCanary')
      .mockResolvedValue(honeyTokenEmail);

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          query: { page: '1' },
        }),
      }),
    } as ExecutionContext;

    const next = {
      handle: () => of({ data: [] }),
    } as CallHandler;

    const result = await interceptor.intercept(context, next).toPromise();
    const finalData = await result;

    expect(finalData.data.length).toBe(1);
    expect(finalData.data[0].email).toBe(honeyTokenEmail);
    expect(canaryService.registerDynamicCanary).toHaveBeenCalled();
  });
});
