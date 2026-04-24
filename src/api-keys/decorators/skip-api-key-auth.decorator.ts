import { SetMetadata } from '@nestjs/common';

export const SKIP_API_KEY_AUTH_KEY = 'skip_api_key_auth';
export const SkipApiKeyAuth = () => SetMetadata(SKIP_API_KEY_AUTH_KEY, true);
