import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as crypto from 'crypto';
import { Experiment, ExperimentStatus } from './entities/experiment.entity';
import { ExperimentVariant } from './entities/experiment-variant.entity';
import { ExperimentAssignment } from './entities/experiment-assignment.entity';
import { ExperimentEvent } from './entities/experiment-event.entity';
import { CreateExperimentDto } from './dto/create-experiment.dto';
import { UpdateExperimentDto } from './dto/update-experiment.dto';

@Injectable()
export class ExperimentsService {
  private readonly logger = new Logger(ExperimentsService.name);

  constructor(
    @InjectRepository(Experiment)
    private readonly experimentRepository: Repository<Experiment>,
    @InjectRepository(ExperimentVariant)
    private readonly variantRepository: Repository<ExperimentVariant>,
    @InjectRepository(ExperimentAssignment)
    private readonly assignmentRepository: Repository<ExperimentAssignment>,
    @InjectRepository(ExperimentEvent)
    private readonly eventRepository: Repository<ExperimentEvent>,
  ) {}

  private deterministicHash(input: string): number {
    const hash = crypto.createHash('sha256').update(input).digest();
    return hash.readUInt32BE(0);
  }

  async getVariant(
    experimentKey: string,
    userId: string,
  ): Promise<{
    variantKey: string | null;
    config: Record<string, any> | null;
  }> {
    const experiment = await this.experimentRepository.findOne({
      where: { key: experimentKey, status: ExperimentStatus.RUNNING },
      relations: ['variants'],
    });

    if (!experiment) {
      return { variantKey: null, config: null };
    }

    const existingAssignment = await this.assignmentRepository.findOne({
      where: { experimentId: experiment.id, userId },
      relations: ['variant'],
    });

    if (existingAssignment) {
      return {
        variantKey: existingAssignment.variant.key,
        config: existingAssignment.variant.config,
      };
    }

    const hash = this.deterministicHash(`${userId}:${experimentKey}`);
    const bucket = hash % 100;

    if (bucket >= experiment.trafficPercent) {
      return { variantKey: null, config: null };
    }

    const totalWeight = experiment.variants.reduce(
      (sum, v) => sum + v.weight,
      0,
    );
    if (totalWeight === 0) {
      return { variantKey: null, config: null };
    }

    const variantBucket = hash % totalWeight;
    let cumulative = 0;
    let selectedVariant: ExperimentVariant | null = null;

    for (const variant of experiment.variants) {
      cumulative += variant.weight;
      if (variantBucket < cumulative) {
        selectedVariant = variant;
        break;
      }
    }

    if (!selectedVariant) {
      return { variantKey: null, config: null };
    }

    const assignment = this.assignmentRepository.create({
      experimentId: experiment.id,
      userId,
      variantId: selectedVariant.id,
    });
    await this.assignmentRepository.save(assignment);

    return {
      variantKey: selectedVariant.key,
      config: selectedVariant.config,
    };
  }

  async trackEvent(
    experimentKey: string,
    userId: string,
    eventName: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const experiment = await this.experimentRepository.findOne({
      where: { key: experimentKey },
    });

    if (!experiment) {
      throw new NotFoundException(
        `Experiment with key "${experimentKey}" not found`,
      );
    }

    const assignment = await this.assignmentRepository.findOne({
      where: { experimentId: experiment.id, userId },
    });

    if (!assignment) {
      throw new BadRequestException('User is not assigned to this experiment');
    }

    const event = this.eventRepository.create({
      experimentId: experiment.id,
      assignmentId: assignment.id,
      eventName,
      metadata,
    });
    await this.eventRepository.save(event);
  }

  async getUserAssignments(userId: string): Promise<
    Array<{
      experimentKey: string;
      variantKey: string;
      config: Record<string, any>;
    }>
  > {
    const experiments = await this.experimentRepository.find({
      where: { status: ExperimentStatus.RUNNING },
    });

    if (experiments.length === 0) return [];

    const experimentIds = experiments.map((e) => e.id);
    const assignments = await this.assignmentRepository.find({
      where: { userId, experimentId: In(experimentIds) },
      relations: ['experiment', 'variant'],
    });

    return this.buildUserAssignments(experiments, assignments, userId);
  }

  private async buildUserAssignments(
    experiments: Experiment[],
    assignments: ExperimentAssignment[],
    userId: string,
  ): Promise<
    Array<{
      experimentKey: string;
      variantKey: string;
      config: Record<string, any>;
    }>
  > {
    const assignmentMap = new Map<
      string,
      { experiment: Experiment; variant: ExperimentVariant }
    >();
    for (const a of assignments) {
      assignmentMap.set(a.experimentId, {
        experiment: a.experiment,
        variant: a.variant,
      });
    }

    const results: Array<{
      experimentKey: string;
      variantKey: string;
      config: Record<string, any>;
    }> = [];

    for (const exp of experiments) {
      const existing = assignmentMap.get(exp.id);
      if (existing) {
        results.push({
          experimentKey: exp.key,
          variantKey: existing.variant.key,
          config: existing.variant.config,
        });
      } else {
        const result = await this.getVariant(exp.key, userId);
        if (result.variantKey) {
          results.push({
            experimentKey: exp.key,
            variantKey: result.variantKey,
            config: result.config ?? {},
          });
        }
      }
    }

    return results;
  }

  async createExperiment(dto: CreateExperimentDto): Promise<Experiment> {
    const existing = await this.experimentRepository.findOne({
      where: { key: dto.key },
    });
    if (existing) {
      throw new ConflictException(
        `Experiment with key "${dto.key}" already exists`,
      );
    }

    const totalWeight = dto.variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight <= 0) {
      throw new BadRequestException(
        'Total variant weight must be greater than 0',
      );
    }

    const experiment = this.experimentRepository.create({
      key: dto.key,
      name: dto.name,
      description: dto.description,
      trafficPercent: dto.trafficPercent ?? 100,
      status: ExperimentStatus.DRAFT,
    });

    const savedExperiment = await this.experimentRepository.save(experiment);

    const variants = dto.variants.map((v) =>
      this.variantRepository.create({
        experimentId: savedExperiment.id,
        key: v.key,
        name: v.name,
        weight: v.weight,
        config: v.config ?? {},
      }),
    );

    savedExperiment.variants = await this.variantRepository.save(variants);
    return savedExperiment;
  }

  async updateExperiment(
    id: string,
    dto: UpdateExperimentDto,
  ): Promise<Experiment> {
    const experiment = await this.experimentRepository.findOne({
      where: { id },
    });
    if (!experiment) {
      throw new NotFoundException(`Experiment with id "${id}" not found`);
    }

    if (dto.status && dto.status === ExperimentStatus.RUNNING) {
      if (experiment.status === ExperimentStatus.CONCLUDED) {
        throw new BadRequestException('Cannot restart a concluded experiment');
      }
    }

    Object.assign(experiment, dto);
    return this.experimentRepository.save(experiment);
  }

  async listExperiments(): Promise<Experiment[]> {
    return this.experimentRepository.find({
      relations: ['variants'],
      order: { createdAt: 'DESC' },
    });
  }

  async getExperimentResults(id: string): Promise<{
    experiment: Experiment;
    variants: Array<{
      variantKey: string;
      variantName: string;
      assignments: number;
      events: Record<string, number>;
      conversionRate: number;
    }>;
    significance: Array<{
      controlKey: string;
      variantKey: string;
      pValue: number;
      significant: boolean;
    }>;
  }> {
    const experiment = await this.experimentRepository.findOne({
      where: { id },
      relations: ['variants'],
    });

    if (!experiment) {
      throw new NotFoundException(`Experiment with id "${id}" not found`);
    }

    const variants = experiment.variants;
    const controlVariant =
      variants.find((v) => v.key === 'control') || variants[0];

    const variantResults: Array<{
      variantKey: string;
      variantName: string;
      assignments: number;
      events: Record<string, number>;
      conversionRate: number;
    }> = [];

    for (const variant of variants) {
      const assignmentCount = await this.assignmentRepository.count({
        where: { variantId: variant.id },
      });

      const events = await this.eventRepository
        .createQueryBuilder('event')
        .innerJoin(
          ExperimentAssignment,
          'assignment',
          'event.assignmentId = assignment.id',
        )
        .where('assignment.variantId = :variantId', { variantId: variant.id })
        .select('event.eventName', 'eventName')
        .addSelect('COUNT(*)', 'count')
        .groupBy('event.eventName')
        .getRawMany();

      const eventMap: Record<string, number> = {};
      for (const e of events) {
        const raw: any = e;
        eventMap[raw.eventName] = parseInt(raw.count, 10);
      }

      const totalConversionEvents = Object.values(eventMap).reduce(
        (sum, c) => sum + c,
        0,
      );
      const conversionRate =
        assignmentCount > 0 ? totalConversionEvents / assignmentCount : 0;

      variantResults.push({
        variantKey: variant.key,
        variantName: variant.name,
        assignments: assignmentCount,
        events: eventMap,
        conversionRate,
      });
    }

    const significance: Array<{
      controlKey: string;
      variantKey: string;
      pValue: number;
      significant: boolean;
    }> = [];

    const controlResult = variantResults.find(
      (v) => v.variantKey === controlVariant.key,
    );
    if (!controlResult) {
      return { experiment, variants: variantResults, significance };
    }

    for (const variantResult of variantResults) {
      if (variantResult.variantKey === controlVariant.key) continue;

      const pValue = this.chiSquaredTest(
        controlResult.assignments,
        controlResult.conversionRate * controlResult.assignments,
        variantResult.assignments,
        variantResult.conversionRate * variantResult.assignments,
      );

      significance.push({
        controlKey: controlVariant.key,
        variantKey: variantResult.variantKey,
        pValue,
        significant: pValue < 0.05,
      });
    }

    return {
      experiment,
      variants: variantResults,
      significance,
    };
  }

  private chiSquaredTest(
    controlTotal: number,
    controlConversions: number,
    variantTotal: number,
    variantConversions: number,
  ): number {
    const controlNon = controlTotal - controlConversions;
    const variantNon = variantTotal - variantConversions;

    const total = controlTotal + variantTotal;
    const totalConversions = controlConversions + variantConversions;
    const totalNon = total - totalConversions;

    if (
      totalConversions === 0 ||
      totalNon === 0 ||
      controlTotal === 0 ||
      variantTotal === 0
    ) {
      return 1.0;
    }

    const expectedControlConv = (controlTotal * totalConversions) / total;
    const expectedControlNon = (controlTotal * totalNon) / total;
    const expectedVariantConv = (variantTotal * totalConversions) / total;
    const expectedVariantNon = (variantTotal * totalNon) / total;

    let chiSquared = 0;

    if (expectedControlConv > 0) {
      chiSquared +=
        Math.pow(controlConversions - expectedControlConv, 2) /
        expectedControlConv;
    }
    if (expectedControlNon > 0) {
      chiSquared +=
        Math.pow(controlNon - expectedControlNon, 2) / expectedControlNon;
    }
    if (expectedVariantConv > 0) {
      chiSquared +=
        Math.pow(variantConversions - expectedVariantConv, 2) /
        expectedVariantConv;
    }
    if (expectedVariantNon > 0) {
      chiSquared +=
        Math.pow(variantNon - expectedVariantNon, 2) / expectedVariantNon;
    }

    return this.chiSquaredPValue(chiSquared, 1);
  }

  private chiSquaredPValue(
    chiSquared: number,
    degreesOfFreedom: number,
  ): number {
    if (chiSquared <= 0 || degreesOfFreedom <= 0) return 1.0;

    return this.regularizedGammaQ(degreesOfFreedom / 2, chiSquared / 2);
  }

  private regularizedGammaQ(a: number, x: number): number {
    if (x < 0 || a <= 0) return 1.0;

    if (x < a + 1) {
      return 1 - this.regularizedGammaP(a, x);
    }

    return this.continuedFraction(a, x);
  }

  private regularizedGammaP(a: number, x: number): number {
    if (x < 0 || a <= 0) return 0;

    const series = this.seriesExpansion(a, x);
    return series * Math.exp(-x + a * Math.log(x) - this.logGamma(a));
  }

  private seriesExpansion(a: number, x: number): number {
    let sum = 1 / a;
    let term = 1 / a;

    for (let n = 1; n < 200; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }

    return sum * x;
  }

  private continuedFraction(a: number, x: number): number {
    let p0 = 0;
    let q0 = 1;
    let p1 = 1;
    let q1 = x;
    let c = 1 / q1;

    for (let n = 1; n < 200; n++) {
      const an = -n * (n - a);
      const bn = x + 2 * n - a;
      let d = bn + an * c;

      if (Math.abs(d) < 1e-60) d = 1e-60;

      c = 1 / d;
      const delta = c * (bn + (an * p0) / q0);
      p0 = p1;
      q0 = q1;
      p1 = p1 * bn + p0 * an;
      q1 = q1 * bn + q0 * an;

      if (Math.abs(q1) < 1e-60) q1 = 1e-60;

      c = p1 / q1;

      if (Math.abs(delta - 1) < 1e-14) break;
    }

    return c;
  }

  private logGamma(x: number): number {
    const coefficients = [
      76.1800917294715, -86.5053203294168, 24.0140982408309, -1.231739572450155,
      0.00120865097386618, -0.000005395239384953,
    ];

    let y = x;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;

    for (let j = 0; j < 6; j++) {
      y += 1;
      ser += coefficients[j] / y;
    }

    return -tmp + Math.log((2.506628274631 * ser) / x);
  }
}
