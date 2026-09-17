import { UnprocessableEntityException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

export function validationException(errors: ValidationError[]) {
  const formatted: Record<string, string[]> = {};
  const visit = (error: ValidationError, prefix = '') => {
    const key = prefix ? `${prefix}.${error.property}` : error.property;
    if (error.constraints) formatted[key] = Object.values(error.constraints);
    error.children?.forEach((child) => visit(child, key));
  };
  errors.forEach((error) => visit(error));
  return new UnprocessableEntityException({
    message: 'Dữ liệu không hợp lệ.',
    errors: formatted,
  });
}

export function businessValidation(field: string, message: string): never {
  throw new UnprocessableEntityException({
    message,
    errors: { [field]: [message] },
  });
}
