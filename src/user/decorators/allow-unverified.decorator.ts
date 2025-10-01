import { SetMetadata } from '@nestjs/common';
import { ALLOW_UNVERIFIED_KEY } from '../guards/verification.guard';

export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED_KEY, true);


