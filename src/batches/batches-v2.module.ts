import { Module } from '@nestjs/common';
import { BatchesV2Controller } from './batches-v2.controller';

@Module({
  controllers: [BatchesV2Controller],
})
export class BatchesV2Module {}
