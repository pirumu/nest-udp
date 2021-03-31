import {
  INCOMING_MESSAGE_EVENT,
  UDP_GATEWAY_METADATA,
  UDP_METHOD_METADATA
} from './constants';
import { Controller, Injectable } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';

// eslint-disable-next-line @typescript-eslint/ban-types
declare let __decorate: Function;

export interface IncomingMessageMetadata {
  name?: string;
}

export function UDPGateWay() {
  // eslint-disable-next-line @typescript-eslint/ban-types
  return (constructor: Function) => {
    Reflect.defineMetadata(UDP_GATEWAY_METADATA, {}, constructor);

    __decorate([Injectable(), Controller()], constructor);

    for (const key of Object.getOwnPropertyNames(constructor.prototype)) {
      if (key === 'constructor') continue;
      if (typeof constructor.prototype[key] !== 'function') continue;
      const methodMeta = Reflect.getMetadata(
        UDP_METHOD_METADATA,
        constructor.prototype[key]
      ) as IncomingMessageMetadata;
      if (methodMeta == null) continue;

      const methodName = methodMeta.name || key;

      const dec = MessagePattern(methodName);
      __decorate([dec], constructor.prototype, key, null);
    }
  };
}

export const IncomingMessage = () => {
  return (
    target: any,
    propertyName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    descriptor: PropertyDescriptor
  ) => {
    Reflect.defineMetadata(
      UDP_METHOD_METADATA,
      { name: INCOMING_MESSAGE_EVENT } || {},
      target[propertyName]
    );
  };
};
