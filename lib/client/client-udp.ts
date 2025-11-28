import { Logger, Type } from '@nestjs/common';
import { ClientProxy, PacketId, WritePacket } from '@nestjs/microservices';
import { UdpEvents, UdpEventsMap, UdpStatus } from '../events';
import { JsonUdpSocket, UdpSocket } from '../helpers';
import { UdpClientOptions } from '../interfaces';
import { UDP_DEFAULT_HOST, UDP_DEFAULT_PORT } from '../constants';
import * as dgram from 'node:dgram';
import { ReadPacket } from '@nestjs/microservices/interfaces/packet.interface';

export class ClientUdp extends ClientProxy<UdpEvents, UdpStatus> {
  protected readonly logger = new Logger(ClientUdp.name);
  protected readonly host: string;
  protected readonly port: number;
  protected readonly type: 'udp4' | 'udp6';
  protected readonly socketClass: Type<UdpSocket>;
  protected socket: UdpSocket | null = null;
  protected connectionPromise: Promise<any> | null = null;
  protected pendingEventListeners: Array<{
    event: keyof UdpEvents;
    callback: UdpEvents[keyof UdpEvents];
  }> = [];

  constructor(private readonly options: Required<UdpClientOptions>['options']) {
    super();
    this.host = this.getOptionsProp(options, 'host', UDP_DEFAULT_HOST);
    this.port = this.getOptionsProp(options, 'port', UDP_DEFAULT_PORT);
    this.type = this.getOptionsProp(options, 'type', 'udp4');
    this.socketClass = this.getOptionsProp(
      options,
      'socketClass',
      JsonUdpSocket,
    );
    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  public connect(): Promise<any> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
    this.socket = this.createSocket();
    this.registerConnectListener(this.socket);
    this.registerCloseListener(this.socket);
    this.registerErrorListener(this.socket);

    this.pendingEventListeners.forEach(({ event, callback }) =>
      this.socket!.on(event, callback as any),
    );
    this.pendingEventListeners = [];

    this.socket.on(
      UdpEventsMap.DATA,
      (args: [WritePacket & PacketId, dgram.RemoteInfo]) =>
        this.handleResponse(...args),
    );
    this._status$.next(UdpStatus.CONNECTED);
    this.connectionPromise = Promise.resolve('ok');
    return this.connectionPromise;
  }

  public async handleResponse(
    buffer: unknown,
    info: dgram.RemoteInfo,
  ): Promise<void> {
    const { err, response, isDisposed, id } =
      await this.deserializer.deserialize(buffer);
    const callback = this.routingMap.get(id);
    if (!callback) {
      return undefined;
    }
    if (isDisposed || err) {
      return callback({
        err,
        response,
        isDisposed: true,
        info,
      });
    }
    callback({
      err,
      response,
      info,
    });
  }

  public createSocket(): UdpSocket {
    const socket = dgram.createSocket({
      type: this.type,
      ...this.options?.socketOptions,
    });

    const socketInstance = new this.socketClass(socket);

    // Configure if it's a ReliableUdpSocket
    if (
      'configure' in socketInstance &&
      typeof socketInstance.configure === 'function'
    ) {
      socketInstance.configure(this.options.reliableOptions);
    }

    return socketInstance;
  }

  public close() {
    this.socket && this.socket.close();
    this.handleClose();
    this.pendingEventListeners = [];
  }

  public registerConnectListener(socket: UdpSocket) {
    socket.on(UdpEventsMap.LISTENING, () => {
      this._status$.next(UdpStatus.CONNECTED);
    });

    socket.udpSocket.bind({
      address: this.host,
      ...this.options?.bindOptions,
    });
  }

  public registerErrorListener(socket: UdpSocket) {
    socket.on(UdpEventsMap.ERROR, (err: Error) => {
      this.handleError(err);
    });
  }

  public registerCloseListener(socket: UdpSocket) {
    socket.on(UdpEventsMap.CLOSE, () => {
      this._status$.next(UdpStatus.DISCONNECTED);
      this.handleClose();
    });
  }

  public handleError(err: any) {
    this.logger.error(err);
  }

  public handleClose() {
    this.socket = null;
    this.connectionPromise = null;

    if (this.routingMap.size > 0) {
      const err = new Error('Connection closed');
      for (const callback of this.routingMap.values()) {
        callback({ err });
      }
      this.routingMap.clear();
    }
  }

  public on<
    EventKey extends keyof UdpEvents = keyof UdpEvents,
    EventCallback extends UdpEvents[EventKey] = UdpEvents[EventKey],
  >(event: EventKey, callback: EventCallback) {
    if (this.socket) {
      this.socket.on(event, callback as any);
    } else {
      this.pendingEventListeners.push({ event, callback });
    }
  }

  public unwrap<T>(): T {
    if (!this.socket) {
      throw new Error(
        'Not initialized. Please call the "connect" method first.',
      );
    }
    return this.socket.udpSocket as T;
  }

  protected publish(
    partialPacket: ReadPacket,
    callback: (packet: WritePacket) => any,
  ): () => void {
    try {
      const packet = this.assignPacketId(partialPacket);
      const serializedPacket = this.serializer.serialize(packet);

      this.routingMap.set(packet.id, callback);

      this.socket!.sendMessage(serializedPacket, this.host, this.port);

      return () => this.routingMap.delete(packet.id);
    } catch (err) {
      callback({ err });
      return () => {};
    }
  }

  protected async dispatchEvent(packet: ReadPacket): Promise<any> {
    const pattern = this.normalizePattern(packet.pattern);
    const serializedPacket = this.serializer.serialize({
      ...packet,
      pattern,
    });
    return this.socket!.sendMessage(serializedPacket, this.host, this.port);
  }
}
