import { Test, TestingModule } from '@nestjs/testing';
import {
  EmbeddedAdminController,
  EmbeddedPublicController,
} from './embedded.controller';
import { EmbeddedService } from './embedded.service';
import { mock, DeepMockProxy } from 'jest-mock-extended';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';

describe('EmbeddedAdminController', () => {
  let controller: EmbeddedAdminController;
  let service: DeepMockProxy<EmbeddedService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmbeddedAdminController],
      providers: [
        {
          provide: EmbeddedService,
          useValue: mock<EmbeddedService>(),
        },
        {
          provide: JwtAuthGuard,
          useValue: mock<JwtAuthGuard>(),
        },
        {
          provide: RolesGuard,
          useValue: mock<RolesGuard>(),
        },
        {
          provide: Reflector,
          useValue: mock<Reflector>(),
        },
      ],
    }).compile();

    controller = module.get<EmbeddedAdminController>(EmbeddedAdminController);
    service = module.get(EmbeddedService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createPartner', () => {
    it('should call the service to create a partner', async () => {
      const dto = { name: 'Test Partner', webhookUrl: 'https://example.com' };
      await controller.createPartner(dto);
      expect(service.createPartner).toHaveBeenCalledWith(dto);
    });
  });

  describe('listPartners', () => {
    it('should call the service to list partners', async () => {
      await controller.listPartners();
      expect(service.listPartners).toHaveBeenCalled();
    });
  });

  describe('updatePartner', () => {
    it('should call the service to update a partner', async () => {
      const dto = { name: 'New Name' };
      await controller.updatePartner('1', dto);
      expect(service.updatePartner).toHaveBeenCalledWith('1', dto);
    });
  });
});

describe('EmbeddedPublicController', () => {
  let controller: EmbeddedPublicController;
  let service: DeepMockProxy<EmbeddedService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmbeddedPublicController],
      providers: [
        {
          provide: EmbeddedService,
          useValue: mock<EmbeddedService>(),
        },
      ],
    }).compile();

    controller = module.get<EmbeddedPublicController>(EmbeddedPublicController);
    service = module.get(EmbeddedService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('authenticate', () => {
    it('should call the service to authenticate a partner', async () => {
      const body = {
        clientId: 'test-client',
        clientSecret: 'test-secret',
        partnerUserId: 'user-123',
      };
      await controller.authenticate(body);
      expect(service.authenticatePartner).toHaveBeenCalledWith(
        body.clientId,
        body.clientSecret,
        body.partnerUserId,
      );
    });
  });
});
