import QRCode from 'qrcode';

interface StellarQRParams {
  address: string;
  assetCode?: string;
  memo?: string;
  format?: 'png' | 'svg';
}

export async function generateStellarQR({
  address,
  assetCode = 'NEXNGN',
  memo,
  format = 'png',
}: StellarQRParams): Promise<string> {
  let uri = `stellar:${address}`;
  const params = new URLSearchParams();

  if (assetCode) params.append('asset_code', assetCode);
  if (memo) params.append('memo', memo);

  if (Array.from(params).length) {
    uri += `?${params.toString()}`;
  }

  const options = format === 'svg' ? { type: 'svg' } : { type: 'image/png' };
  return QRCode.toDataURL(uri, options);
}
