import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { businessValidation } from '../common/validation';
import { UploadImageDto } from './uploads.dto';

export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export type ImageFile = { buffer: Buffer; size: number; mimetype: string };

@Injectable()
export class UploadsService {
  constructor(private readonly config: ConfigService) {}

  async image(file: ImageFile | undefined, purpose: UploadImageDto['purpose']) {
    if (!file?.buffer.length) businessValidation('file', 'Vui lòng chọn ảnh.');
    if (file.size > MAX_IMAGE_BYTES || file.buffer.length > MAX_IMAGE_BYTES)
      businessValidation('file', 'Ảnh tối đa 3 MB.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
      businessValidation('file', 'Chỉ nhận ảnh JPG, PNG hoặc WebP.');
    const url = this.config
      .get<string>('SUPABASE_URL')
      ?.trim()
      .replace(/\/$/, '');
    const key =
      this.config.get<string>('SUPABASE_SECRET_KEY')?.trim() ||
      this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.trim();
    const bucket =
      this.config.get<string>('SUPABASE_STORAGE_BUCKET')?.trim() ||
      'pickleball-images';
    if (!url || !key || !/^[a-zA-Z0-9_-]+$/.test(bucket))
      throw new ServiceUnavailableException(
        'Chưa cấu hình Supabase Storage trên backend.',
      );
    try {
      const parsed = new URL(url);
      if (
        parsed.protocol !== 'https:' ||
        parsed.username ||
        parsed.password ||
        parsed.pathname !== '/' ||
        parsed.search ||
        parsed.hash
      )
        throw new Error('Invalid URL');
    } catch {
      throw new ServiceUnavailableException(
        'SUPABASE_URL phải là URL HTTPS của project Supabase.',
      );
    }

    let image: Buffer;
    try {
      const input = sharp(file.buffer, {
        limitInputPixels: 24000000,
        failOn: 'warning',
      });
      const metadata = await input.metadata();
      if (
        !['jpeg', 'png', 'webp'].includes(metadata.format ?? '') ||
        (metadata.pages ?? 1) > 1
      )
        throw new Error('Unsupported image');
      image = await input
        .rotate()
        .resize({
          width: purpose === 'players' ? 800 : 1920,
          height: purpose === 'players' ? 800 : 1920,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer();
    } catch {
      businessValidation(
        'file',
        'Ảnh không hợp lệ hoặc quá lớn (tối đa 24 megapixel).',
      );
    }
    if (image.length > MAX_IMAGE_BYTES)
      businessValidation('file', 'Ảnh sau tối ưu vẫn vượt quá 3 MB.');
    const objectPath = `${purpose}/${randomUUID()}.webp`;
    let response: Response;
    try {
      const credentials = {
        apikey: key,
        ...(key.startsWith('sb_secret_')
          ? {}
          : { Authorization: `Bearer ${key}` }),
      };
      const bucketResponse = await fetch(`${url}/storage/v1/bucket/${bucket}`, {
        headers: credentials,
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      if (!bucketResponse.ok) throw new Error('Bucket unavailable');
      const details = (await bucketResponse.json()) as { public?: boolean };
      if (details.public !== true) throw new Error('Bucket must be public');
      response = await fetch(
        `${url}/storage/v1/object/${bucket}/${objectPath}`,
        {
          method: 'POST',
          headers: {
            ...credentials,
            'Content-Type': 'image/webp',
            'cache-control': 'max-age=31536000',
            'x-upsert': 'false',
          },
          body: new Uint8Array(image),
          signal: AbortSignal.timeout(20000),
          redirect: 'error',
        },
      );
    } catch {
      throw new ServiceUnavailableException(
        'Không kết nối được bucket public. Kiểm tra cấu hình Supabase Storage và thử lại.',
      );
    }
    if (!response.ok)
      throw new ServiceUnavailableException(
        'Upload thất bại. Kiểm tra key backend, bucket public và quyền Storage trong Supabase.',
      );
    return {
      url: `${url}/storage/v1/object/public/${bucket}/${objectPath}`,
      path: objectPath,
      bucket,
      content_type: 'image/webp',
      size: image.length,
    };
  }
}
