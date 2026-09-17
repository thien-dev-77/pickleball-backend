import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { UploadsService, MAX_IMAGE_BYTES } from './uploads.service';

describe('Supabase image uploads', () => {
  const config = {
    SUPABASE_URL: 'https://test-project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'server-private-key',
    SUPABASE_STORAGE_BUCKET: 'pickleball-images',
  };
  const service = () => new UploadsService(new ConfigService(config));
  let fetchMock: jest.SpyInstance;
  const png = () =>
    sharp({
      create: { width: 1200, height: 900, channels: 3, background: '#222f51' },
    })
      .png()
      .toBuffer();
  const file = (buffer: Buffer, mimetype = 'image/png') => ({
    buffer,
    size: buffer.length,
    mimetype,
  });
  beforeEach(() => {
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ public: true }), { status: 200 }),
      )
      .mockResolvedValue(new Response('{}', { status: 200 }));
  });
  afterEach(() => jest.restoreAllMocks());

  it('optimizes a real avatar to WebP and returns a public URL without credentials', async () => {
    const result = await service().image(file(await png()), 'players');
    expect(result.url).toMatch(
      /^https:\/\/test-project.supabase.co\/storage\/v1\/object\/public\/pickleball-images\/players\/[a-f0-9-]+\.webp$/,
    );
    const [url, request] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain('/storage/v1/object/pickleball-images/players/');
    expect(request.method).toBe('POST');
    expect(request.headers).toMatchObject({
      apikey: config.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'image/webp',
      'x-upsert': 'false',
    });
    const metadata = await sharp(
      Buffer.from(request.body as Uint8Array),
    ).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(800);
    expect(metadata.height).toBe(600);
    expect(metadata.exif).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(
      config.SUPABASE_SERVICE_ROLE_KEY,
    );
  });

  it('keeps cover proportions and uses unique paths for CDN-safe replacements', async () => {
    const buffer = await sharp({
      create: { width: 2400, height: 1200, channels: 3, background: '#ffbb34' },
    })
      .jpeg()
      .toBuffer();
    const first = await service().image(
      file(buffer, 'image/jpeg'),
      'tournaments',
    );
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ public: true })))
      .mockResolvedValue(new Response('{}'));
    const second = await service().image(
      file(buffer, 'image/jpeg'),
      'tournaments',
    );
    expect(first.path).not.toBe(second.path);
    const [, request] = fetchMock.mock.calls[1] as [string, RequestInit];
    const meta = await sharp(
      Buffer.from(request.body as Uint8Array),
    ).metadata();
    expect(meta.width).toBe(1920);
    expect(meta.height).toBe(960);
  });

  it('uses a modern server secret only in the apikey header and keeps it out of responses', async () => {
    const result = await new UploadsService(
      new ConfigService({
        ...config,
        SUPABASE_SECRET_KEY: 'sb_secret_server-only',
      }),
    ).image(file(await png()), 'players');
    const [, request] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(request.headers).toMatchObject({ apikey: 'sb_secret_server-only' });
    expect(request.headers).not.toHaveProperty('Authorization');
    expect(JSON.stringify(result)).not.toContain('sb_secret_server-only');
  });

  it('rejects missing, oversized, SVG and fake-image uploads before Storage writes', async () => {
    await expect(service().image(undefined, 'players')).rejects.toMatchObject({
      status: 422,
    });
    await expect(
      service().image(file(Buffer.alloc(MAX_IMAGE_BYTES + 1)), 'players'),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      service().image(file(Buffer.from('<svg/>'), 'image/svg+xml'), 'players'),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      service().image(
        file(Buffer.from('<html>not an image</html>')),
        'players',
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported image content even when its MIME claims PNG', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    );
    await expect(service().image(file(svg), 'players')).rejects.toMatchObject({
      status: 422,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns actionable errors for missing config, private buckets and storage failures', async () => {
    await expect(
      new UploadsService(new ConfigService({})).image(
        file(await png()),
        'players',
      ),
    ).rejects.toMatchObject({ status: 503 });
    fetchMock
      .mockReset()
      .mockResolvedValue(new Response(JSON.stringify({ public: false })));
    await expect(
      service().image(file(await png()), 'players'),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock
      .mockReset()
      .mockResolvedValueOnce(new Response(JSON.stringify({ public: true })))
      .mockResolvedValue(
        new Response('private upstream details', { status: 403 }),
      );
    await expect(service().image(file(await png()), 'players')).rejects.toThrow(
      'Upload thất bại',
    );
  });
});
