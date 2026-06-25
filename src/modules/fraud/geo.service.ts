import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';

interface GeoData {
  country: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  isp: string | null;
}

@Injectable()
export class GeoService implements OnModuleInit {
  private readonly logger = new Logger(GeoService.name);
  private reader: any = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const dbPath = this.configService.get<string>('MAXMIND_DB_PATH');
    if (!dbPath) {
      this.logger.warn(
        'MAXMIND_DB_PATH not set — GeoIP lookup disabled. Fraud scoring will return score 0.',
      );
      return;
    }

    const resolvedPath = path.resolve(dbPath);
    if (!fs.existsSync(resolvedPath)) {
      this.logger.warn(
        `MaxMind database not found at ${resolvedPath} — GeoIP lookup disabled.`,
      );
      return;
    }

    try {
      const maxmind = await import('maxmind');
      this.reader = await maxmind.open(resolvedPath);
      this.logger.log(`GeoIP database loaded from ${resolvedPath}`);
    } catch (error) {
      this.logger.error(
        `Failed to load MaxMind database: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  lookup(ip: string): GeoData {
    if (!this.reader || !ip || ip === '127.0.0.1' || ip === '::1') {
      return {
        country: null,
        city: null,
        latitude: null,
        longitude: null,
        isp: null,
      };
    }

    try {
      const result = this.reader.get(ip);
      if (!result) {
        return {
          country: null,
          city: null,
          latitude: null,
          longitude: null,
          isp: null,
        };
      }

      return {
        country: result.country?.iso_code ?? null,
        city: result.city?.names?.en ?? null,
        latitude: result.location?.latitude ?? null,
        longitude: result.location?.longitude ?? null,
        isp: result.traits?.isp ?? result.traits?.organization ?? null,
      };
    } catch (error) {
      this.logger.warn(
        `GeoIP lookup failed for ${ip}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        country: null,
        city: null,
        latitude: null,
        longitude: null,
        isp: null,
      };
    }
  }
}
