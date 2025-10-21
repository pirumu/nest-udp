import * as dgram from 'dgram';
import { BaseRpcContext } from '@nestjs/microservices';
import { UdpSocket } from '../helpers';

type UdpContextArgs = [UdpSocket, dgram.RemoteInfo, unknown, string];

export class UdpContext extends BaseRpcContext<UdpContextArgs> {
  constructor(args: UdpContextArgs) {
    super(args);
  }

  getSocketRef() {
    return this.args[0];
  }

  getRemoteInfo() {
    return this.args[1];
  }

  getRawMessage() {
    return this.args[2];
  }

  getPattern(): any {
    return this.args[3];
  }
}
