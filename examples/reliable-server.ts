import { NestFactory } from '@nestjs/core';
import {
  ServerUdp,
  ReliableUdpSocket,
  UdpContext,
  UdpServerOptions,
  CompressionCodecType,
} from '../lib';
import { Module, Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload, Ctx } from '@nestjs/microservices';

@Controller()
class AppController {
  @MessagePattern('process-large-data')
  handleLargeData(@Payload() data: any, @Ctx() context: UdpContext) {
    const remoteInfo = context.getRemoteInfo();
    Logger.log(`Received data from ${remoteInfo.address}:${remoteInfo.port}`);
    Logger.log(`Data size: ${JSON.stringify(data).length} bytes`);

    if (Array.isArray(data)) {
      Logger.log(`Processing array with ${data.length} items`);
      return {
        processed: true,
        itemCount: data.length,
        totalSize: JSON.stringify(data).length,
      };
    }

    return {
      processed: true,
      dataType: typeof data,
      totalSize: JSON.stringify(data).length,
    };
  }

  @MessagePattern('analyze-text')
  analyzeText(@Payload() text: string) {
    Logger.log(`Analyzing text of ${text.length} bytes`);

    return {
      length: text.length,
      wordCount: text.split(/\s+/).length,
      characterCount: text.replace(/\s/g, '').length,
      preview: text.substring(0, 100),
    };
  }

  @MessagePattern('ping')
  ping(@Payload() data: any) {
    Logger.log('Received ping:', data);
    return { message: 'pong', timestamp: Date.now() };
  }
}

@Module({
  controllers: [AppController],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.createMicroservice<UdpServerOptions>(
    AppModule,
    {
      strategy: new ServerUdp({
        host: '0.0.0.0',
        port: 41235,
        type: 'udp4',
        socketClass: ReliableUdpSocket,
        reliableOptions: {
          maxMessageSize: 1400,
          maxRetries: 3,
          retryInterval: 100,
          enableChecksum: true,
          compression: {
            enabled: true,
            codec: CompressionCodecType.SNAPPY,
            level: 6,
            minSize: 256,
            minReduction: 10,
          },
          chunkSize: 1200,
          reassemblyTimeout: 30000,
          requestTimeout: 5000,
        },
      }),
    },
  );

  await app.listen();
  Logger.log('UDP Server with ReliableUdpSocket listening on port 41235');
  Logger.log('\nReady to receive data...');
}

bootstrap();
