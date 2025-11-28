import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

export class CodecNotAvailableException extends RuntimeException {
  constructor(codec: string) {
    super(`${codec} codec not available`);
  }
}
