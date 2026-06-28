import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { OfacEntry } from '../entities/ofac-entry.entity';
import {
  WatchlistProvider,
  WatchlistMatch,
  ScreeningQuery,
} from '../interfaces/watchlist-provider.interface';

@Injectable()
export class OfacProvider implements WatchlistProvider {
  readonly name = 'OFAC';
  private readonly logger = new Logger(OfacProvider.name);
  private readonly SDN_CSV_URL =
    'https://www.treasury.gov/ofac/downloads/sdn.csv';

  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(OfacEntry)
    private readonly ofacRepo: Repository<OfacEntry>,
  ) {}

  async screen(query: ScreeningQuery): Promise<WatchlistMatch[]> {
    const normalizedQuery = this.normalize(query.fullName);
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

    if (tokens.length === 0) return [];

    const entries = await this.ofacRepo.createQueryBuilder('e')
      .where('e."normalizedName" ILIKE :pattern', {
        pattern: `%${tokens[0]}%`,
      })
      .limit(200)
      .getMany();

    const matches: WatchlistMatch[] = [];

    for (const entry of entries) {
      const score = this.fuzzyScore(normalizedQuery, entry.normalizedName, entry.aliases);
      if (score >= 30) {
        matches.push({
          entityId: entry.id,
          name: entry.sdnName,
          score,
          matchType: 'NAME',
          datasets: ['us_ofac_sdn'],
          isPep: false,
        });
      }
    }

    return matches.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  async syncFromTreasury(): Promise<number> {
    this.logger.log('Starting OFAC SDN list sync from Treasury');

    let csv: string;
    try {
      const response = await firstValueFrom(
        this.httpService.get<string>(this.SDN_CSV_URL, {
          responseType: 'text',
          timeout: 60000,
        }),
      );
      csv = response.data;
    } catch (error) {
      this.logger.error(
        `Failed to download OFAC SDN list: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }

    const entries = this.parseCsv(csv);
    this.logger.log(`Parsed ${entries.length} OFAC entries`);

    await this.ofacRepo.clear();
    await this.ofacRepo.save(entries, { chunk: 500 });

    this.logger.log(`OFAC sync complete: ${entries.length} entries stored`);
    return entries.length;
  }

  private parseCsv(csv: string): Partial<OfacEntry>[] {
    const lines = csv.split('\n').filter((l) => l.trim());
    const entries: Partial<OfacEntry>[] = [];

    for (const line of lines) {
      const cols = this.splitCsvLine(line);
      if (cols.length < 2) continue;

      const sdnName = (cols[1] ?? '').replace(/^"|"$/g, '').trim();
      if (!sdnName) continue;

      entries.push({
        sdnName,
        normalizedName: this.normalize(sdnName),
        sdnType: (cols[2] ?? '').replace(/^"|"$/g, '').trim() || null,
        program: (cols[3] ?? '').replace(/^"|"$/g, '').trim() || null,
        title: (cols[4] ?? '').replace(/^"|"$/g, '').trim() || null,
        remarks: (cols[11] ?? '').replace(/^"|"$/g, '').trim() || null,
        aliases: [],
      });
    }

    return entries;
  }

  private splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  private normalize(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private fuzzyScore(query: string, target: string, aliases: string[]): number {
    const candidates = [target, ...aliases.map((a) => this.normalize(a))];
    let best = 0;

    for (const candidate of candidates) {
      const score = this.tokenOverlapScore(query, candidate);
      if (score > best) best = score;
    }

    return best;
  }

  private tokenOverlapScore(a: string, b: string): number {
    const tokensA = new Set(a.split(/\s+/).filter(Boolean));
    const tokensB = new Set(b.split(/\s+/).filter(Boolean));

    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let overlap = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) overlap++;
    }

    const precision = overlap / tokensA.size;
    const recall = overlap / tokensB.size;

    if (precision + recall === 0) return 0;
    const f1 = (2 * precision * recall) / (precision + recall);
    return Math.round(f1 * 100);
  }
}
