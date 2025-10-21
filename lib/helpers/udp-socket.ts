import { Buffer } from 'buffer';
import * as dgram from 'dgram';
import { UdpEventsMap } from '../events';
import { InvalidJSONFormatException } from '@nestjs/microservices/errors/invalid-json-format.exception';

export abstract class UdpSocket {
  private isClosed = false;

  public get udpSocket() {
    return this.socket;
  }

  constructor(public readonly socket: dgram.Socket) {
    this.socket.on(UdpEventsMap.MESSAGE, this.onMessage.bind(this));
    this.socket.on(UdpEventsMap.LISTENING, () => (this.isClosed = false));
    this.socket.on(UdpEventsMap.CLOSE, () => (this.isClosed = true));
    this.socket.on(UdpEventsMap.ERROR, () => (this.isClosed = true));
  }

  public connect(port: number, host: string) {
    this.socket.connect(port, host);
    return this;
  }

  public on(event: string, callback: (...args: any[]) => void) {
    this.socket.on(event, (...args) => {
      callback(args);
    });
    return this;
  }

  public once(event: string, callback: (...args: any[]) => void) {
    this.socket.once(event, callback);
    return this;
  }

  public close() {
    this.socket.close();
    return this;
  }

  public sendMessage(
    message: any,
    host?: string,
    port?: number,
    callback?: (err?: any) => void,
  ) {
    if (this.isClosed) {
      callback && callback(new Error('Udp socket closed or not connected'));
      return;
    }
    this.handleSend(message, host, port, callback);
  }

  protected abstract handleSend(
    message: any,
    host?: string,
    port?: number,
    callback?: (err?: any) => void,
  ): any;

  private onMessage(data: Buffer, rinfo: dgram.RemoteInfo) {
    try {
      this.handleData(data, rinfo);
    } catch (e) {
      this.socket.emit(UdpEventsMap.ERROR, e.message);
      this.socket.close();
    }
  }

  protected abstract handleData(data: Buffer, rinfo: dgram.RemoteInfo): any;

  protected emitMessage(data: string, info: any) {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(data);
    } catch (e) {
      throw new InvalidJSONFormatException(e, data);
    }
    message = message || {};
    this.socket.emit(UdpEventsMap.DATA, message, info);
  }
}
