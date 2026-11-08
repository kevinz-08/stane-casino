import { BadRequestException, ValidationPipe, type ValidationError } from '@nestjs/common';

function flatten(errors: ValidationError[], parent = ''): string[] {
  return errors.flatMap((e) => {
    const path = parent ? `${parent}.${e.property}` : e.property;
    const own = Object.values(e.constraints ?? {});
    return [...own, ...flatten(e.children ?? [], path)];
  });
}

/**
 * Global validation: unknown properties are rejected (not silently dropped), payloads are
 * transformed into DTO class instances, and failures use the `VALIDATION_FAILED` code.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        details: flatten(errors),
      }),
  });
}
