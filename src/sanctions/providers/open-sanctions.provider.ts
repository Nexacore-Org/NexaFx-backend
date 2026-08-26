import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  WatchlistProvider,
  WatchlistMatch,
  ScreeningQuery,
} from '../interfaces/watchlist-provider.interface';

interface OpenSanctionsResult {
  id: string;
  caption: string;
  score: number;
  datasets: string[];
  properties?: {
    topics?: string[];
  };
}

interface OpenSanctionsResponse {
  responses: {
    [key: string]: {
      results: OpenSanctionsResult[];
    };
  };
}

@Injectable()
export class OpenSanctionsProvider implements WatchlistProvider {
  readonly name = 'OPEN_SANCTIONS';
  private readonly logger = new Logger(OpenSanctionsProvider.name);
  private readonly baseUrl = 'https://api.opensanctions.org';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async screen(query: ScreeningQuery): Promise<WatchlistMatch[]> {
    const apiKey = this.configService.get<string>('OPENSANCTIONS_API_KEY');

    const properties: Record<string, string[]> = {
      name: [query.fullName],
    };
    if (query.dateOfBirth) {
      properties.birthDate = [query.dateOfBirth];
    }
    if (query.nationality) {
      properties.nationality = [query.nationality];
    }

    const body = {
      queries: {
        q0: {
          schema: 'Person',
          properties,
        },
      },
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `ApiKey ${apiKey}`;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<OpenSanctionsResponse>(
          `${this.baseUrl}/match/default`,
          body,
          { headers, timeout: 10000 },
        ),
      );

      const results = response.data?.responses?.q0?.results ?? [];

      return results.map((r) => ({
        entityId: r.id,
        name: r.caption,
        score: Math.round(r.score * 100),
        matchType: 'NAME',
        datasets: r.datasets ?? [],
        isPep: (r.properties?.topics ?? []).some(
          (t) => t.toLowerCase().includes('pep') || t.toLowerCase().includes('sanction'),
        ),
      }));
    } catch (error) {
      this.logger.warn(
        `Open Sanctions API unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }
}
