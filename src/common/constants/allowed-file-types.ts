export const ALLOWED_FILE_TYPES: Record<
  string,
  { extension: string; contentType: string }
> = {
  'image/jpeg': { extension: '.jpg', contentType: 'image/jpeg' },
  'image/png': { extension: '.png', contentType: 'image/png' },
  'application/pdf': { extension: '.pdf', contentType: 'application/pdf' },
  'video/mp4': { extension: '.mp4', contentType: 'video/mp4' },
  'video/webm': { extension: '.webm', contentType: 'video/webm' },
  'video/quicktime': { extension: '.mov', contentType: 'video/quicktime' },
};
