import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { OAuthProvider } from '../entities/oauth-account.entity';

export class UnlinkOauthDto {
  @ApiProperty({ enum: OAuthProvider, example: OAuthProvider.GOOGLE })
  @IsEnum(OAuthProvider)
  provider: OAuthProvider;
}
