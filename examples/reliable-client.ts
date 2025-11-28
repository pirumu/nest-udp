import { Module, Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ClientsModule, ClientProxy } from '@nestjs/microservices';
import { ClientUdp, ReliableUdpSocket, CompressionCodecType } from '../lib';
import { lastValueFrom } from 'rxjs';

@Injectable()
class AppService implements OnModuleInit {
  constructor(private readonly client: ClientProxy) {}

  async onModuleInit() {
    await this.client.connect();
    Logger.log('Connected to UDP server with ReliableUdpSocket');

    Logger.log('--- Example 1: Simple Ping ---');
    await this.sendPing();

    Logger.log('\n--- Example 2: Large Array (will be compressed) ---');
    await this.sendLargeArray();

    Logger.log('\n--- Example 3: Very Large Text (compressed + chunked) ---');
    await this.sendLargeText();

    Logger.log('\n--- Example 4: Complex Object ---');
    await this.sendComplexObject();

    Logger.log('\n✓ All examples completed successfully!');
    // process.exit(0);
  }

  async sendPing() {
    try {
      const start = Date.now();
      const result = await lastValueFrom(
        this.client.send('ping', { message: 'hello', timestamp: start }),
      );
      // await lastValueFrom(
      //   this.client.send('ping', { message: 'hello', timestamp: start }),
      // );
      const elapsed = Date.now() - start;
      Logger.log('Response:', result);
      Logger.log(`Round-trip time: ${elapsed}ms`);
    } catch (error) {
      Logger.error('Error:', error.message);
    }
  }

  async sendLargeArray() {
    // Create array of 400 objects (~50KB - will trigger compression)
    const largeArray = Array.from({ length: 400 }, (_, i) => ({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      description: `This is a detailed description for user ${i}`,
      metadata: {
        created: new Date().toISOString(),
        tags: ['tag1', 'tag2', 'tag3'],
        score: Math.random() * 100,
        nested: {
          level1: 'data',
          level2: { value: i * 10 },
        },
      },
    }));

    const size = JSON.stringify(largeArray).length;
    Logger.log(`Sending array of ${largeArray.length} objects (${size} bytes)`);
    Logger.log('Expected: Will be compressed');

    try {
      const start = Date.now();
      const result = await lastValueFrom(
        this.client.send('process-large-data', largeArray),
      );
      const elapsed = Date.now() - start;
      Logger.log('Response:', result);
      Logger.log(`Time taken: ${elapsed}ms`);
    } catch (error) {
      Logger.error('Error:', error.message);
    }
  }

  async sendLargeText() {
    // Generate ~50KB of text (will trigger compression + chunking)
    const paragraph =
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ' +
      'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.repeat(
        100,
      );
    const largeText = paragraph.repeat(500); // ~50KB

    Logger.log(`Sending text of ${largeText.length} bytes`);
    Logger.log('Expected: Will be compressed + chunked into multiple packets');

    try {
      const start = Date.now();
      const result = await lastValueFrom(
        this.client.send('analyze-text', largeText),
      );
      const elapsed = Date.now() - start;
      Logger.log('Analysis:', result);
      Logger.log(`Time taken: ${elapsed}ms`);
    } catch (error) {
      Logger.error('Error:', error.message);
    }
  }

  async sendComplexObject() {
    // Complex nested object with large data
    const complexObject = {
      metadata: {
        timestamp: Date.now(),
        version: '1.0.0',
      },
      data: {
        users: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`,
        })),
        products: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          title: `Product ${i}`,
          price: Math.random() * 1000,
          description: `A detailed description for product ${i}`,
        })),
        transactions: Array.from({ length: 200 }, (_, i) => ({
          id: i,
          userId: Math.floor(Math.random() * 100),
          productId: Math.floor(Math.random() * 100),
          amount: Math.random() * 500,
          timestamp: Date.now() - Math.random() * 86400000,
        })),
      },
    };

    const size = JSON.stringify(complexObject).length;
    Logger.log(`Sending complex object (${size} bytes)`);

    try {
      const start = Date.now();
      const result = await lastValueFrom(
        this.client.send('process-large-data', complexObject),
      );
      const elapsed = Date.now() - start;
      Logger.log('Response:', result);
      Logger.log(`Time taken: ${elapsed}ms`);
    } catch (error) {
      Logger.error('Error:', error.message);
    }
  }
}

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'UDP_SERVICE',
        customClass: ClientUdp,
        options: {
          host: 'localhost',
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
        },
      },
    ]),
  ],
  providers: [
    AppService,
    {
      provide: ClientProxy,
      useFactory: (client: ClientUdp) => client,
      inject: ['UDP_SERVICE'],
    },
  ],
})
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.init();
}

bootstrap();
