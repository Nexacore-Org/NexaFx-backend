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

export interface WatchlistProvider {
  readonly name: string;
  screen(query: ScreeningQuery): Promise<WatchlistMatch[]>;
}
