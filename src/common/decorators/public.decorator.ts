import { SetMetadata } from '@nestjs/common';
const IS_PUBLIC_KEY = 'isPublic';
export { IS_PUBLIC_KEY };
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);