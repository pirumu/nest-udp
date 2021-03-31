import {
  createSocket,
  BindOptions,
  SocketOptions,
  Socket,
  RemoteInfo
} from 'dgram';
import { Logger } from '@nestjs/common';
import { INCOMING_MESSAGE_EVENT, LISTENING_EVENT } from './constants';
import { Server, CustomTransportStrategy } from '@nestjs/microservices';

export class UdpContext {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars,@typescript-eslint/no-empty-function
  constructor(private msg: Buffer, private rinfo: RemoteInfo) {}
}
export enum SocketType {
  UDP4 = 'udp4',
  UDP6 = 'udp6'
}
export interface UdpServerOption {
  bindOptions: BindOptions;
  socketOptions: SocketOptions;
}
export class UdpServer extends Server implements CustomTransportStrategy {
  protected logger = new Logger('UdpServer');
  public server: Socket;

  constructor(private readonly options: UdpServerOption) {
    super();
  }

  public async listen(callback: () => void) {
    this.server = createSocket(this.options.socketOptions);
    this.server.bind(this.options.bindOptions);
    this.server.on(LISTENING_EVENT, () => {
      const address = this.server.address();
      this.logger.log(
        `UDP Server listening on http://${address.address}:${address.port}`
      );
    });
    this.server.on(INCOMING_MESSAGE_EVENT, (msg: Buffer, rinfo: RemoteInfo) => {
      const handler = this.getHandlerByPattern(INCOMING_MESSAGE_EVENT);
      if (handler !== null) {
        const data = this.transformBufferData(msg);
        const context = new UdpContext(data, rinfo);
        handler(data, context);
      }
    });
    callback();
  }

  public transformBufferData(data: Buffer) {
    return JSON.parse(JSON.stringify(data.toString('utf8').split('\\n')));
  }
  public async close() {
    this.server.close();
    this.logger.error(`UDP Server close !`);
  }
}
