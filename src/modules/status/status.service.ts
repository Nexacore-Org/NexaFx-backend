import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan } from 'typeorm';
import { StatusComponent, ComponentStatus } from './entities/status-component.entity';
import { StatusIncident, IncidentStatus } from './entities/status-incident.entity';

const DEFAULT_COMPONENTS = [
  { name: 'API', slug: 'api' },
  { name: 'Payments', slug: 'payments' },
  { name: 'Exchange', slug: 'exchange' },
  { name: 'Stellar Network', slug: 'stellar-network' },
  { name: 'Notifications', slug: 'notifications' },
];

@Injectable()
export class StatusService {
  constructor(
    @InjectRepository(StatusComponent)
    private readonly componentRepo: Repository<StatusComponent>,
    @InjectRepository(StatusIncident)
    private readonly incidentRepo: Repository<StatusIncident>,
  ) {}

  async initDefaultComponents(): Promise<void> {
    const count = await this.componentRepo.count();
    if (count === 0) {
      await this.componentRepo.save(
        DEFAULT_COMPONENTS.map((c) => this.componentRepo.create(c)),
      );
    }
  }

  async getPublicStatus() {
    const components = await this.componentRepo.find({ order: { name: 'ASC' } });
    const activeIncidents = await this.incidentRepo.find({
      where: { status: MoreThan(IncidentStatus.RESOLVED) },
      order: { startedAt: 'DESC' },
    });

    const now = new Date();
    const lastUpdated = components.reduce(
      (latest, c) => (c.updatedAt > latest ? c.updatedAt : latest),
      now,
    );

    return { components, activeIncidents, lastUpdated };
  }

  async getIncidentHistory(page = 1, limit = 20) {
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const [incidents, total] = await this.incidentRepo.findAndCount({
      where: { createdAt: MoreThan(since), status: IncidentStatus.RESOLVED },
      order: { startedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { incidents, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createIncident(dto: {
    title: string;
    body: string;
    severity: string;
    affectedComponents?: string[];
    startedAt?: Date;
    createdBy?: string;
  }): Promise<StatusIncident> {
    const incident = this.incidentRepo.create({
      title: dto.title,
      body: dto.body,
      severity: dto.severity as any,
      affectedComponents: dto.affectedComponents ?? [],
      startedAt: dto.startedAt ?? new Date(),
      createdBy: dto.createdBy ?? null,
    });
    return this.incidentRepo.save(incident);
  }

  async updateIncidentStatus(id: string, status: IncidentStatus): Promise<StatusIncident> {
    const incident = await this.incidentRepo.findOne({ where: { id } });
    if (!incident) throw new NotFoundException('Incident not found');
    incident.status = status;
    return this.incidentRepo.save(incident);
  }

  async resolveIncident(id: string): Promise<StatusIncident> {
    const incident = await this.incidentRepo.findOne({ where: { id } });
    if (!incident) throw new NotFoundException('Incident not found');
    incident.status = IncidentStatus.RESOLVED;
    incident.resolvedAt = new Date();
    return this.incidentRepo.save(incident);
  }

  async updateComponentStatus(
    slug: string,
    status: ComponentStatus,
    uptimePercent?: string,
  ): Promise<StatusComponent> {
    const component = await this.componentRepo.findOne({ where: { slug } });
    if (!component) throw new NotFoundException('Component not found');
    component.status = status;
    if (uptimePercent !== undefined) component.uptimePercent90d = uptimePercent;
    return this.componentRepo.save(component);
  }
}
