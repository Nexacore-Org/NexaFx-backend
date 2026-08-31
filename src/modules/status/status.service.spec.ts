import { NotFoundException } from '@nestjs/common';
import { StatusService } from './status.service';
import {
  ComponentStatus,
  StatusComponent,
} from './entities/status-component.entity';
import {
  IncidentSeverity,
  IncidentStatus,
  StatusIncident,
} from './entities/status-incident.entity';

describe('StatusService', () => {
  let service: StatusService;
  let componentRepo: {
    count: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let incidentRepo: {
    find: jest.Mock;
    findAndCount: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };

  beforeEach(() => {
    componentRepo = {
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
      create: jest.fn().mockImplementation((e) => e),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    incidentRepo = {
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      create: jest.fn().mockImplementation((e) => e),
      save: jest.fn().mockImplementation((e) => Promise.resolve(e)),
      findOne: jest.fn().mockResolvedValue(null),
    };

    service = new StatusService(componentRepo as any, incidentRepo as any);
  });

  describe('initDefaultComponents', () => {
    it('seeds the five default components when none exist', async () => {
      componentRepo.count.mockResolvedValue(0);

      await service.initDefaultComponents();

      expect(componentRepo.create).toHaveBeenCalledTimes(5);
      expect(componentRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'API', slug: 'api' }),
          expect.objectContaining({ name: 'Payments', slug: 'payments' }),
          expect.objectContaining({ name: 'Exchange', slug: 'exchange' }),
          expect.objectContaining({
            name: 'Stellar Network',
            slug: 'stellar-network',
          }),
          expect.objectContaining({
            name: 'Notifications',
            slug: 'notifications',
          }),
        ]),
      );
    });

    it('does not seed components when some already exist', async () => {
      componentRepo.count.mockResolvedValue(3);

      await service.initDefaultComponents();

      expect(componentRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('getPublicStatus', () => {
    it('returns components ordered by name and only active (unresolved) incidents', async () => {
      const component: Partial<StatusComponent> = {
        id: 'c-1',
        name: 'API',
        slug: 'api',
        status: ComponentStatus.OPERATIONAL,
        updatedAt: new Date('2099-01-01T00:00:00Z'),
      };
      componentRepo.find.mockResolvedValue([component]);

      const incident: Partial<StatusIncident> = {
        id: 'i-1',
        status: IncidentStatus.INVESTIGATING,
        title: 'Degraded API',
      };
      incidentRepo.find.mockResolvedValue([incident]);

      const result = await service.getPublicStatus();

      expect(componentRepo.find).toHaveBeenCalledWith({
        order: { name: 'ASC' },
      });
      expect(result.components).toEqual([component]);
      expect(result.activeIncidents).toEqual([incident]);
      expect(result.lastUpdated).toEqual(new Date('2099-01-01T00:00:00Z'));
    });

    it('filters incidents to those not yet resolved', async () => {
      await service.getPublicStatus();

      const args = incidentRepo.find.mock.calls[0][0] as {
        where: { status: unknown };
        order: { startedAt: 'DESC' };
      };
      // status is wrapped in a TypeORM MoreThan(RESOLVED) operator.
      expect(args.where.status).toBeDefined();
      expect(args.order).toEqual({ startedAt: 'DESC' });
    });
  });

  describe('getIncidentHistory', () => {
    const resolvedIncident: Partial<StatusIncident> = {
      id: 'i-1',
      status: IncidentStatus.RESOLVED,
      title: 'Resolved incident',
    };

    it('returns the last 90 days of resolved incidents with pagination', async () => {
      incidentRepo.findAndCount.mockResolvedValue([[resolvedIncident], 5]);

      const result = await service.getIncidentHistory(2, 10);

      expect(incidentRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
      expect(result.incidents).toEqual([resolvedIncident]);
      expect(result.total).toBe(5);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it('defaults to page 1 with a limit of 20', async () => {
      incidentRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.getIncidentHistory();

      expect(incidentRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 }),
      );
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(0);
    });

    it('only includes resolved incidents', async () => {
      await service.getIncidentHistory(1, 20);

      const args = incidentRepo.findAndCount.mock.calls[0][0] as {
        where: { status: IncidentStatus };
      };
      expect(args.where.status).toBe(IncidentStatus.RESOLVED);
    });
  });

  describe('createIncident', () => {
    it('creates an incident linked to the affected components with an initial severity', async () => {
      const dto = {
        title: 'API degradation',
        body: 'We are investigating.',
        severity: IncidentSeverity.MAJOR,
        affectedComponents: ['api', 'payments'],
        startedAt: new Date('2026-08-01T10:00:00Z'),
        createdBy: 'admin-1',
      };
      incidentRepo.create.mockImplementation((e) => ({ id: 'inc-1', ...e }));
      incidentRepo.save.mockImplementation((e) => Promise.resolve(e));

      const result = await service.createIncident(dto);

      expect(incidentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'API degradation',
          body: 'We are investigating.',
          severity: IncidentSeverity.MAJOR,
          affectedComponents: ['api', 'payments'],
          startedAt: dto.startedAt,
          createdBy: 'admin-1',
        }),
      );
      expect(result.id).toBe('inc-1');
      expect(result.severity).toBe(IncidentSeverity.MAJOR);
      expect(result.affectedComponents).toEqual(['api', 'payments']);
    });

    it('defaults affectedComponents, startedAt, and createdBy when omitted', async () => {
      incidentRepo.create.mockImplementation((e) => ({ id: 'inc-1', ...e }));
      incidentRepo.save.mockImplementation((e) => Promise.resolve(e));

      const result = await service.createIncident({
        title: 'Degradation',
        body: 'Details',
        severity: IncidentSeverity.MINOR,
      });

      expect(result.affectedComponents).toEqual([]);
      expect(result.startedAt).toBeInstanceOf(Date);
      expect(result.createdBy).toBeNull();
    });
  });

  describe('updateIncidentStatus', () => {
    it('throws NotFoundException when the incident does not exist', async () => {
      incidentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateIncidentStatus('missing', IncidentStatus.IDENTIFIED),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates the incident status', async () => {
      const incident = {
        id: 'inc-1',
        status: IncidentStatus.INVESTIGATING,
      } as StatusIncident;
      incidentRepo.findOne.mockResolvedValue(incident);

      const result = await service.updateIncidentStatus(
        'inc-1',
        IncidentStatus.MONITORING,
      );

      expect(result.status).toBe(IncidentStatus.MONITORING);
      expect(incidentRepo.save).toHaveBeenCalledWith(incident);
    });
  });

  describe('resolveIncident', () => {
    it('throws NotFoundException when the incident does not exist', async () => {
      incidentRepo.findOne.mockResolvedValue(null);

      await expect(service.resolveIncident('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('marks the incident resolved and stamps resolvedAt', async () => {
      const incident = {
        id: 'inc-1',
        status: IncidentStatus.MONITORING,
        resolvedAt: null,
      } as StatusIncident;
      incidentRepo.findOne.mockResolvedValue(incident);
      incidentRepo.save.mockImplementation((e) => Promise.resolve(e));

      const result = await service.resolveIncident('inc-1');

      expect(result.status).toBe(IncidentStatus.RESOLVED);
      expect(result.resolvedAt).toBeInstanceOf(Date);
    });
  });

  describe('updateComponentStatus', () => {
    it('throws NotFoundException when the component does not exist', async () => {
      componentRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateComponentStatus('api', ComponentStatus.DEGRADED),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates the component status and uptime when provided', async () => {
      const component = {
        id: 'c-1',
        slug: 'api',
        status: ComponentStatus.OPERATIONAL,
        uptimePercent90d: '100.00',
      } as StatusComponent;
      componentRepo.findOne.mockResolvedValue(component);
      componentRepo.save.mockImplementation((e) => Promise.resolve(e));

      const result = await service.updateComponentStatus(
        'api',
        ComponentStatus.PARTIAL_OUTAGE,
        '98.50',
      );

      expect(result.status).toBe(ComponentStatus.PARTIAL_OUTAGE);
      expect(result.uptimePercent90d).toBe('98.50');
    });

    it('leaves uptime untouched when not provided', async () => {
      const component = {
        id: 'c-1',
        slug: 'api',
        status: ComponentStatus.OPERATIONAL,
        uptimePercent90d: '100.00',
      } as StatusComponent;
      componentRepo.findOne.mockResolvedValue(component);
      componentRepo.save.mockImplementation((e) => Promise.resolve(e));

      const result = await service.updateComponentStatus(
        'api',
        ComponentStatus.DEGRADED,
      );

      expect(result.status).toBe(ComponentStatus.DEGRADED);
      expect(result.uptimePercent90d).toBe('100.00');
    });
  });
});
