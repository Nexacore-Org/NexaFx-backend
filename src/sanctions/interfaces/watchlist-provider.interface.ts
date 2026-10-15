export interface ScreeningQuery {
  fullName: string;
  dateOfBirth?: string;
  nationality?: string;
}

export interface WatchlistMatch {
  entityId: string;
  name: string;
  score: number;
  matchType: string;
  datasets: string[];
  isPep: boolean;
}

/**
 * A provider answer. `failed` tells "the provider could not be queried" (HTTP
 * error, timeout, empty local list) apart from "queried, no match", so an
 * outage is never stored as a clean screening.
 */
export interface WatchlistScreenResult {
  matches: WatchlistMatch[];
  failed: boolean;
}

export interface WatchlistProvider {
  readonly name: string;
  screen(query: ScreeningQuery): Promise<WatchlistScreenResult>;
}
