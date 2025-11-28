import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ReliableSocketController } from './reliable-socket.controller';
import { ClientUdp } from '@pirumu/nest-udp';
import { ReliableUdpSocket } from '@pirumu/nest-udp/helpers/reliable-udp-socket/reliable-udp-socket';
import { CompressionCodecType } from '@pirumu/nest-udp/compression';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'RELIABLE_CLIENT',
        customClass: ClientUdp,
        options: {
          host: '127.0.0.1',
          port: 3010,
          type: 'udp4',
          socketClass: ReliableUdpSocket,
          reliableOptions: {
            maxMessageSize: 1400,
            chunkSize: 500,
            maxRetries: 3,
            retryInterval: 200,
            requestTimeout: 5000,
            enableChecksum: true,
            compression: {
              enabled: true,
              codec: CompressionCodecType.GZIP,
              level: 6,
              minSize: 256,
              minReduction: 10,
            },
          },
        },
      },
    ]),
  ],
  controllers: [ReliableSocketController],
})
export class ReliableSocketModule {}
