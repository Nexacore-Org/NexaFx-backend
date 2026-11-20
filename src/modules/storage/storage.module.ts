import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { LocalStorageSignatureMiddleware } from './local-storage-signature.middleware';
import { STORAGE_SERVICE_TOKEN } from './storage.service';
import { LocalStorageService } from './local-storage.service';
import { S3StorageService } from './s3-storage.service';
import { getStorageSigningSecret } from './storage-signing-secret';

@Module({
  providers: [
    LocalStorageService,
    S3StorageService,
    {
      provide: STORAGE_SERVICE_TOKEN,
      useFactory: (local: LocalStorageService, s3: S3StorageService) => {
        const driver = process.env.STORAGE_DRIVER || 'local';
        if (driver !== 's3') {
          getStorageSigningSecret();
        }
        return driver === 's3' ? s3 : local;
      },
      inject: [LocalStorageService, S3StorageService],
    },
  ],
  exports: [STORAGE_SERVICE_TOKEN],
})
export class StorageModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    if ((process.env.STORAGE_DRIVER || 'local') !== 's3') {
      consumer.apply(LocalStorageSignatureMiddleware).forRoutes('uploads/*');
    }
  }
}
