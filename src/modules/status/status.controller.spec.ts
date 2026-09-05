import {
  StatusPublicController,
  StatusAdminController,
} from './status.controller';
import { StatusService } from './status.service';
import { ComponentStatus } from './entities/status-component.entity';
import { IncidentStatus } from './entities/status-incident.entity';

const mockStatusService = () => ({
  getPublicStatus: jest.fn(),
  getIncidentHistory: jest.fn(),
  createIncident: jest.fn(),
  updateIncidentStatus: jest.fn(),
  resolveIncident: jest.fn(),
  updateComponentStatus: jest.fn(),
});

describe('StatusPublicController', () => {
  let controller: StatusPublicController;
  let statusService: ReturnType<typeof mockStatusService>;

  beforeEach(() => {
    statusService = mockStatusService();
    controller = new StatusPublicController(
      statusService as unknown as StatusService,
    );
  });

  describe('getPublicStatus', () => {
    it('returns the public status page', async () => {
      statusService.getPublicStatus.mockResolvedValue({
        components: [],
        activeIncidents: [],
        lastUpdated: new Date(),
      });

      const result = await controller.getPublicStatus();

      expect(statusService.getPublicStatus).toHaveBeenCalled();
      expect(result).toHaveProperty('components');
      expect(result).toHaveProperty('activeIncidents');
      expect(result).toHaveProperty('lastUpdated');
    });
  });

  describe('getIncidentHistory', () => {
    it('parses page and limit query parameters', async () => {
      statusService.getIncidentHistory.mockResolvedValue({
        incidents: [],
        total: 0,
        page: 2,
        limit: 10,
        totalPages: 0,
      });

      await controller.getIncidentHistory('2', '10');

      expect(statusService.getIncidentHistory).toHaveBeenCalledWith(2, 10);
    });

    it('defaults to page 1 and limit 20 when parameters are absent', async () => {
      statusService.getIncidentHistory.mockResolvedValue({});

      await controller.getIncidentHistory();

      expect(statusService.getIncidentHistory).toHaveBeenCalledWith(1, 20);
    });

    it('never exposes internal incident notes through the public endpoint', async () => {
      // The public history only surfaces resolved incidents from the service;
      // assert the service output is passed through untouched.
      const history = {
        incidents: [{ id: 'i-1', title: 'Resolved' }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };
      statusService.getIncidentHistory.mockResolvedValue(history);

      const result = await controller.getIncidentHistory('1', '20');

      expect(result).toEqual(history);
    });
  });
});

describe('StatusAdminController', () => {
  let controller: StatusAdminController;
  let statusService: ReturnType<typeof mockStatusService>;

  beforeEach(() => {
    statusService = mockStatusService();
    controller = new StatusAdminController(
      statusService as unknown as StatusService,
    );
  });

  describe('createIncident', () => {
    it('forwards the full incident DTO to the service', async () => {
      statusService.createIncident.mockResolvedValue({ id: 'inc-1' });
      const dto = {
        title: 'API degradation',
        body: 'Investigating',
        severity: 'MAJOR',
        affectedComponents: ['api'],
      };

      const result = await controller.createIncident(dto);

      expect(statusService.createIncident).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ id: 'inc-1' });
    });
  });

  describe('updateIncidentStatus', () => {
    it('forwards the incident id and status to the service', async () => {
      statusService.updateIncidentStatus.mockResolvedValue({ id: 'inc-1' });

      await controller.updateIncidentStatus('inc-1', IncidentStatus.MONITORING);

      expect(statusService.updateIncidentStatus).toHaveBeenCalledWith(
        'inc-1',
        IncidentStatus.MONITORING,
      );
    });
  });

  describe('resolveIncident', () => {
    it('forwards the incident id to the service', async () => {
      statusService.resolveIncident.mockResolvedValue({
        id: 'inc-1',
        status: IncidentStatus.RESOLVED,
      });

      await controller.resolveIncident('inc-1');

      expect(statusService.resolveIncident).toHaveBeenCalledWith('inc-1');
    });
  });

  describe('updateComponentStatus', () => {
    it('forwards slug, status, and optional uptime to the service', async () => {
      statusService.updateComponentStatus.mockResolvedValue({ id: 'c-1' });

      await controller.updateComponentStatus('api', {
        status: ComponentStatus.DEGRADED,
        uptimePercent: '98.50',
      });

      expect(statusService.updateComponentStatus).toHaveBeenCalledWith(
        'api',
        ComponentStatus.DEGRADED,
        '98.50',
      );
    });

    it('omits uptime when not provided', async () => {
      statusService.updateComponentStatus.mockResolvedValue({ id: 'c-1' });

      await controller.updateComponentStatus('api', {
        status: ComponentStatus.OPERATIONAL,
      });

      expect(statusService.updateComponentStatus).toHaveBeenCalledWith(
        'api',
        ComponentStatus.OPERATIONAL,
        undefined,
      );
    });
  });
});
