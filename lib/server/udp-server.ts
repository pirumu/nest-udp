import { Logger, Type } from '@nestjs/common';
import { isString, isUndefined } from '@nestjs/common/utils/shared.utils';
import * as dgram from 'dgram';
import {
  UDP_DEFAULT_HOST,
  UDP_DEFAULT_PORT,
  UDP_TRANSPORT,
} from '../constants';
import { UdpEvents, UdpEventsMap, UdpStatus } from '../events';

import {
  CustomTransportStrategy,
  IncomingRequest,
  PacketId,
  Server,
  TransportId,
  WritePacket,
} from '@nestjs/microservices';
import { UdpServerOptions } from '../interfaces';
import { UdpContext } from '../ctx-host';
import { ReadPacket } from '@nestjs/microservices/interfaces/packet.interface';
import {
  EADDRINUSE,
  NO_MESSAGE_HANDLER,
} from '@nestjs/microservices/constants';
import { JsonUdpSocket, UdpSocket } from '../helpers';
import { InvalidUdpDataReceptionException } from '../errors';

export class ServerUdp
  extends Server<UdpEvents, UdpStatus>
  implements CustomTransportStrategy
{
  public transportId: TransportId = UDP_TRANSPORT;

  protected server: dgram.Socket;
  protected readonly host: string;
  protected readonly port: number;
  protected readonly type: 'udp4' | 'udp6';
  protected readonly socketClass: Type<UdpSocket>;
  protected isManuallyTerminated = false;
  protected retryAttemptsCount = 0;
  protected pendingEventListeners: Array<{
    event: keyof UdpEvents;
    callback: UdpEvents[keyof UdpEvents];
  }> = [];

  protected readonly pendingResponses = new Map<
    string,
    {
      remoteInfo: dgram.RemoteInfo;
      timestamp: number;
    }
  >();

  private udpLogger = new Logger(ServerUdp.name);

  constructor(private readonly options: Required<UdpServerOptions>['options']) {
    super();
    this.port = this.getOptionsProp(options, 'port', UDP_DEFAULT_PORT);
    this.host = this.getOptionsProp(options, 'host', UDP_DEFAULT_HOST);
    this.type = this.getOptionsProp(options, 'type', 'udp4');
    this.socketClass = this.getOptionsProp(
      options,
      'socketClass',
      JsonUdpSocket,
    );

    this.init();
    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  public listen(
    callback: (err?: unknown, ...optionalParams: unknown[]) => void,
  ) {
    this.server.once(UdpEventsMap.ERROR, (err: any) => {
      if (err?.code === EADDRINUSE) {
        this._status$.next(UdpStatus.DISCONNECTED);
        return callback(err);
      }
    });

    this.server.bind(
      {
        address: this.host,
        port: this.port,
        ...this.options.bindOptions,
      },
      () => {
        this.udpLogger.log(
          `Udp server listening on ${this.host}:${this.port} with type ${this.type}`,
        );
        callback();
      },
    );
  }

  public close() {
    this.isManuallyTerminated = true;
    this.pendingResponses.clear();
    this.server.close();
    this.pendingEventListeners = [];
  }

  public async handleMessage(
    socket: UdpSocket,
    rawMessage: unknown,
    remoteInfo: dgram.RemoteInfo,
  ) {
    const packet = await this.deserializer.deserialize(rawMessage);
    const pattern = !isString(packet.pattern)
      ? JSON.stringify(packet.pattern)
      : packet.pattern;

    const udpContext = new UdpContext([
      socket,
      remoteInfo,
      rawMessage,
      pattern,
    ]);
    if (isUndefined((packet as IncomingRequest).id)) {
      return this.handleEvent(pattern, packet, udpContext);
    }

    const handler = this.getHandlerByPattern(pattern);
    if (!handler) {
      const status = 'error';
      const noHandlerPacket = this.serializer.serialize({
        id: (packet as IncomingRequest).id,
        status,
        err: NO_MESSAGE_HANDLER,
      });
      return socket.sendMessage(noHandlerPacket);
    }
    return this.onProcessingStartHook(
      this.transportId,
      udpContext,
      async () => {
        const response$ = this.transformToObservable(
          await handler(packet.data, udpContext),
        );

        response$ &&
          this.send(response$, data => {
            Object.assign(data, { id: (packet as IncomingRequest).id });
            const outgoingResponse = this.serializer.serialize(
              data as WritePacket & PacketId,
            );

            this.onProcessingEndHook?.(this.transportId, udpContext);
            socket.sendMessage(
              outgoingResponse,
              remoteInfo.address,
              remoteInfo.port,
            );
          });
      },
    );
  }

  public handleClose(): undefined | number | NodeJS.Timeout {
    if (
      this.isManuallyTerminated ||
      !this.getOptionsProp(this.options, 'retryAttempts') ||
      this.retryAttemptsCount >=
        this.getOptionsProp(this.options, 'retryAttempts', 0)
    ) {
      return undefined;
    }
    ++this.retryAttemptsCount;
    return setTimeout(
      () =>
        this.server.bind({
          port: this.port,
          address: this.host,
          ...this.options.bindOptions,
        }),
      this.getOptionsProp(this.options, 'retryDelay', 0),
    );
  }

  public unwrap<T>(): T {
    if (!this.server) {
      throw new Error(
        'Not initialized. Please call the "listen"/"startAllMicroservices" method before accessing the server.',
      );
    }
    return this.server as T;
  }

  public on<
    EventKey extends keyof UdpEvents = keyof UdpEvents,
    EventCallback extends UdpEvents[EventKey] = UdpEvents[EventKey],
  >(event: EventKey, callback: EventCallback) {
    if (this.server) {
      this.server.on(event, callback as any);
    } else {
      this.pendingEventListeners.push({ event, callback });
    }
  }

  protected init() {
    this.server = dgram.createSocket({
      type: this.type,
      ...this.options?.socketOptions,
    });

    this.registerHandler(this.server);
    this.registerListeningListener(this.server);
    this.registerErrorListener(this.server);
    this.registerCloseListener(this.server);

    this.pendingEventListeners.forEach(({ event, callback }) =>
      this.server.on(event, callback as any),
    );
    this.pendingEventListeners = [];
  }

  public registerHandler(socket: dgram.Socket) {
    const readSocket = this.getSocketInstance(socket);
    readSocket.on(
      UdpEventsMap.DATA,
      async (args: [ReadPacket & PacketId, dgram.RemoteInfo]) => {
        return this.handleMessage(readSocket, ...args);
      },
    );
    readSocket.on(UdpEventsMap.ERROR, (err: Error) => {
      const invalidError = new InvalidUdpDataReceptionException(err);
      this.handleError(invalidError as any);
    });
  }

  protected registerListeningListener(socket: dgram.Socket) {
    socket.on(UdpEventsMap.LISTENING, () => {
      this._status$.next(UdpStatus.CONNECTED);
    });
  }

  protected registerErrorListener(socket: dgram.Socket) {
    socket.on(UdpEventsMap.ERROR, (err: Error) => {
      this.handleError(err as any);
    });
  }

  protected registerCloseListener(socket: dgram.Socket) {
    socket.on(UdpEventsMap.CLOSE, () => {
      this._status$.next(UdpStatus.DISCONNECTED);
      this.handleClose();
    });
  }

  protected getSocketInstance(socket: dgram.Socket): UdpSocket {
    return new this.socketClass(this.server, socket);
  }
}
