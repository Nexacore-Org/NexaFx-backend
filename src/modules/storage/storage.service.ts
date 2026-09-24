export const STORAGE_SERVICE_TOKEN = 'StorageService';

export interface StorageService {
  upload(file: Express.Multer.File, path: string): Promise<string>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}
