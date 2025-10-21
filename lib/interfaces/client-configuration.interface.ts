import { UDP_TRANSPORT } from '../constants';
import { Deserializer, Serializer } from '@nestjs/microservices';
import { Type } from '@nestjs/common';
import { UdpSocket } from '../helpers';
import * as dgram from 'dgram';
import { MicroserviceOptions } from '@nestjs/microservices/interfaces/microservice-configuration.interface';

export type UdpClientOptions = MicroserviceOptions & {
  transport?: typeof UDP_TRANSPORT;
  options?: {
    host?: string;
    port?: number;
    type?: dgram.SocketType;
    retryAttempts?: number;
    retryDelay?: number;
    serializer?: Serializer;
    deserializer?: Deserializer;
    socketClass?: Type<UdpSocket>;
    socketOptions?: dgram.SocketOptions;
    bindOptions?: Omit<dgram.BindOptions, 'address' | 'port'>;
  };
};
