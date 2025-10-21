import * as dgram from 'dgram';
import { UdpSocket } from './udp-socket';
import { MaxPacketLengthExceededException } from '@nestjs/microservices/errors/max-packet-length-exceeded.exception';

const MAX_UDP_PAYLOAD_SIZE = 65507;

export class JsonUdpSocket extends UdpSocket {
  protected handleSend(
    message: any,
    host?: string,
    port?: number,
    callback?: (err?: any) => void,
  ) {
    try {
      const jsonString = JSON.stringify(message);
      const messageSize = Buffer.byteLength(jsonString, 'utf8');

      if (messageSize > MAX_UDP_PAYLOAD_SIZE) {
        throw new MaxPacketLengthExceededException(MAX_UDP_PAYLOAD_SIZE);
      }
      if (host && port) {
        this.socket.send(jsonString, port, host, callback);
      } else {
        this.socket.send(jsonString, callback);
      }
    } catch (error) {
      callback && callback(error);
    }
  }

  protected handleData(data: Buffer, rinfo: dgram.RemoteInfo) {
    try {
      const dataString = data.toString();
      this.emitMessage(dataString, rinfo);
    } catch (error) {
      this.socket.emit('error', error);
    }
  }
}
