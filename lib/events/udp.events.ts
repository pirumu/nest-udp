import { RemoteInfo } from 'dgram';

type VoidCallback = () => void;

type OnErrorCallback = (error: Error) => void;

export const enum UdpStatus {
  DISCONNECTED = 'disconnected',
  CONNECTED = 'connected',
}

export const enum UdpEventsMap {
  ERROR = 'error',
  MESSAGE = 'message',
  DATA = 'data',
  LISTENING = 'listening',
  CLOSE = 'close',
}

export type UdpEvents = {
  error: OnErrorCallback;
  message: (msg: Buffer, rinfo: RemoteInfo) => void;
  listening: VoidCallback;
  close: VoidCallback;
};
