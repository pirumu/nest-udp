import { RuntimeException } from '@nestjs/core/errors/exceptions/runtime.exception';

export class InvalidUdpDataReceptionException extends RuntimeException {
  constructor(err: string | Error) {
    const errMsgStr =
      typeof err === 'string'
        ? err
        : err &&
            typeof err === 'object' &&
            'message' in err &&
            typeof (err as any).message === 'string'
          ? (err as any).message
          : String(err);
    const _errMsg = `The invalid received message from udp server: ${errMsgStr}`;
    super(_errMsg);
  }
}
