import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as packageJson from '../../../package.json';

export interface MobileManifestResponse {
  baseUrl: string;
  apiVersion: string;
  minSupportedVersion: string;
  updateRequired: boolean;
}

@Injectable()
export class MobileSdkGuideService {
  constructor(private readonly configService: ConfigService) {}

  getManifest(clientVersion?: string): MobileManifestResponse {
    const apiVersion = 'v2';
    const minSupportedVersion = this.configService.get<string>('MOBILE_MIN_SUPPORTED_VERSION', '1.0.0');
    const baseUrl = this.configService.get<string>('API_BASE_URL', 'https://api.nexafx.com');

    let updateRequired = false;
    if (clientVersion) {
      updateRequired = this.isVersionOutdated(clientVersion, minSupportedVersion);
    }

    return {
      baseUrl,
      apiVersion,
      minSupportedVersion,
      updateRequired,
    };
  }

  private isVersionOutdated(current: string, minimum: string): boolean {
    const currParts = current.split('.').map(Number);
    const minParts = minimum.split('.').map(Number);

    for (let i = 0; i < 3; i++) {
      const c = currParts[i] || 0;
      const m = minParts[i] || 0;
      if (c < m) return true;
      if (c > m) return false;
    }
    return false;
  }
}

import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Stub service for v2 issue #490 - mobile-sdk-guide.
 * Real implementation lives in the upstream PR; this file is a scaffold
 * stub only. Closes #490.
 */
@Injectable()
export class MobileSdkGuideService {
  handle(): never {
    throw new NotImplementedException(
      'Closes #490 - scaffold stub for mobile-sdk-guide'
    );
  }
}
