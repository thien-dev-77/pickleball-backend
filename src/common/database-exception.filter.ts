import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { EntityNotFoundError, QueryFailedError } from 'typeorm';
import type { Response } from 'express';

@Catch(EntityNotFoundError, QueryFailedError)
export class DatabaseExceptionFilter implements ExceptionFilter {
  catch(
    exception: EntityNotFoundError | QueryFailedError,
    host: ArgumentsHost,
  ) {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof EntityNotFoundError) {
      response
        .status(HttpStatus.NOT_FOUND)
        .json({ message: 'Không tìm thấy dữ liệu.' });
      return;
    }
    const error = exception.driverError as { code?: string; detail?: string };
    if (error.code === '23505') {
      const field =
        error.detail?.match(/Key \(([^)]+)\)/)?.[1]?.split(',')[0] ?? 'data';
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        message: 'Dữ liệu đã tồn tại.',
        errors: { [field]: ['Giá trị này đã được sử dụng.'] },
      });
      return;
    }
    if (error.code === '23503') {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        message: 'Dữ liệu đang được sử dụng hoặc tham chiếu không hợp lệ.',
      });
      return;
    }
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ message: 'Không thể xử lý truy vấn cơ sở dữ liệu.' });
  }
}
