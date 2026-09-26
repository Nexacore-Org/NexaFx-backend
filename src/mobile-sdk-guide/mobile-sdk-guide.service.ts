import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MobileSdkGuide } from './entities/mobile-sdk-guide.entity';
import { QueryMobileSdkGuideDto } from './dto/query-mobile-sdk-guide.dto';

export interface SdkBootstrapResponse {
  platform: string;
  sdkVersion: string;
  minAppVersion: string;
  supportedEndpoints: string[];
  authFlow: Record<string, unknown>;
}

@Injectable()
export class MobileSdkGuideService {
  constructor(
    @InjectRepository(MobileSdkGuide)
    private readonly guideRepository: Repository<MobileSdkGuide>,
  ) {}

  async getBootstrapConfig(
    query: QueryMobileSdkGuideDto,
  ): Promise<SdkBootstrapResponse> {
    const platform = query.platform ?? 'ios';
    const guide = await this.guideRepository.findOne({
      where: { platform, isActive: true },
    });

    if (!guide) {
      throw new NotFoundException(
        `No active SDK guide configuration found for platform '${platform}'`,
      );
    }

    return this.toBootstrapResponse(guide);
  }

  async getVersionInfo(platform: string): Promise<SdkBootstrapResponse> {
    const guide = await this.guideRepository.findOne({
      where: { platform, isActive: true },
    });

    if (!guide) {
      throw new NotFoundException(
        `No active SDK guide configuration found for platform '${platform}'`,
      );
    }

    return this.toBootstrapResponse(guide);
  }

  async listSupportedPlatforms(): Promise<string[]> {
    const guides = await this.guideRepository.find({
      where: { isActive: true },
      select: ['platform'],
    });

    return guides.map((guide) => guide.platform);
  }

  private toBootstrapResponse(guide: MobileSdkGuide): SdkBootstrapResponse {
    return {
      platform: guide.platform,
      sdkVersion: guide.sdkVersion,
      minAppVersion: guide.minAppVersion,
      supportedEndpoints: guide.supportedEndpoints ?? [],
      authFlow: guide.authFlow ?? {},
    };
  }
}
