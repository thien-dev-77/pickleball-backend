import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadImageDto } from './uploads.dto';
import { UploadsService, MAX_IMAGE_BYTES } from './uploads.service';
import type { ImageFile } from './uploads.service';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('images')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: MAX_IMAGE_BYTES,
        files: 1,
        fields: 1,
        fieldSize: 64,
        parts: 3,
      },
    }),
  )
  image(
    @UploadedFile() file: ImageFile | undefined,
    @Body() body: UploadImageDto,
  ) {
    return this.uploads.image(file, body.purpose);
  }
}
