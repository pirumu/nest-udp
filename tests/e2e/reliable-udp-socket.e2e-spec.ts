import { INestApplication } from '@nestjs/common';
import { MicroserviceOptions } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ReliableSocketModule } from '../src/reliable-socket.module';
import { ServerUdp } from '@pirumu/nest-udp';
import { ReliableUdpSocket } from '@pirumu/nest-udp/helpers/reliable-udp-socket/reliable-udp-socket';
import { CompressionCodecType } from '@pirumu/nest-udp/compression';

describe('ReliableUdpSocket E2E', () => {
  let server;
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [ReliableSocketModule],
    }).compile();

    app = module.createNestApplication();
    server = app.getHttpAdapter().getInstance();

    app.connectMicroservice<MicroserviceOptions>({
      strategy: new ServerUdp({
        host: '127.0.0.1',
        port: 3010,
        type: 'udp4',
        socketClass: ReliableUdpSocket,
        reliableOptions: {
          maxMessageSize: 1400,
          maxRetries: 3,
          retryInterval: 100,
          enableChecksum: true,
          compression: {
            enabled: true,
            codec: CompressionCodecType.GZIP,
            level: 6,
            minSize: 256,
            minReduction: 10,
          },
          chunkSize: 1200,
          reassemblyTimeout: 30000,
          requestTimeout: 5000,
        },
      }),
    });

    await app.startAllMicroservices();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Basic REQ/ACK/RES pattern', () => {
    it('should echo small messages', () => {
      return request(server)
        .post('/reliable/echo')
        .send({ message: 'Hello ReliableUDP' })
        .expect(201)
        .expect(res => {
          expect(res.body.received).toEqual({ message: 'Hello ReliableUDP' });
          expect(res.body.timestamp).toBeDefined();
        });
    });

    it('should handle complex data structures', () => {
      const complexData = {
        id: 123,
        name: 'Test User',
        nested: {
          array: [1, 2, 3, 4, 5],
          object: { key: 'value' },
        },
      };

      return request(server)
        .post('/reliable/echo')
        .send(complexData)
        .expect(201)
        .expect(res => {
          expect(res.body.received).toEqual(complexData);
        });
    });
  });

  describe('Automatic chunking', () => {
    it('should handle large messages via chunking', async () => {
      const largeData = {
        payload: 'x'.repeat(2000),
      };

      const response = await request(server)
        .post('/reliable/large-data')
        .send(largeData)
        .expect(201);

      expect(response.body.received).toBe(true);
      expect(response.body.size).toBeGreaterThan(2000);
    }, 10000);

    it('should handle very large messages', async () => {
      const veryLargeData = {
        items: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          data: 'x'.repeat(50),
        })),
      };

      const response = await request(server)
        .post('/reliable/large-data')
        .send(veryLargeData)
        .expect(201);

      expect(response.body.received).toBe(true);
    }, 10000);
  });

  describe('Compression', () => {
    it('should compress highly compressible data', async () => {
      const compressibleData = {
        payload: 'x'.repeat(1000),
      };

      const response = await request(server)
        .post('/reliable/compressed')
        .send(compressibleData)
        .expect(201);

      expect(response.body.received).toBe(true);
      expect(response.body.dataLength).toBe(1000);
    });

    it('should handle structured compressible data', async () => {
      const structuredData = {
        payload: JSON.stringify({
          users: Array.from({ length: 50 }, (_, i) => ({
            id: i,
            name: `User ${i}`,
            email: `user${i}@example.com`,
          })),
        }),
      };

      const response = await request(server)
        .post('/reliable/compressed')
        .send(structuredData)
        .expect(201);

      expect(response.body.received).toBe(true);
    });
  });

  describe('Compression with chunking', () => {
    it('should compress and chunk large messages', async () => {
      const largeCompressibleData = {
        payload: 'x'.repeat(3000),
      };

      const response = await request(server)
        .post('/reliable/large-data')
        .send(largeCompressibleData)
        .expect(201);

      expect(response.body.received).toBe(true);
    }, 15000);
  });

  describe('Checksum validation', () => {
    it('should validate checksums on messages', () => {
      return request(server)
        .post('/reliable/echo')
        .send({ data: 'checksum test', value: 123 })
        .expect(201)
        .expect(res => {
          expect(res.body.received).toEqual({
            data: 'checksum test',
            value: 123,
          });
        });
    });
  });

  describe('Retry and timeout', () => {
    it('should handle successful requests without retries', () => {
      return request(server)
        .post('/reliable/echo')
        .send({ test: 'no retry' })
        .expect(201);
    });

    it('should handle multiple concurrent requests', async () => {
      const requests = Array.from({ length: 10 }, (_, i) =>
        request(server).post('/reliable/echo').send({ id: i }).expect(201),
      );

      const responses = await Promise.all(requests);

      responses.forEach((res, i) => {
        expect(res.body.received.id).toBe(i);
      });
    });
  });

  describe('Data integrity', () => {
    it('should maintain UTF-8 character integrity', () => {
      const utf8Data = {
        message: 'Hello 世界 🌍 مرحبا',
      };

      return request(server)
        .post('/reliable/echo')
        .send(utf8Data)
        .expect(201)
        .expect(res => {
          expect(res.body.received).toEqual(utf8Data);
        });
    });

    it('should handle special characters in chunked messages', async () => {
      const specialCharsData = {
        text: '世界🌍'.repeat(500),
      };

      const response = await request(server)
        .post('/reliable/large-data')
        .send(specialCharsData)
        .expect(201);

      expect(response.body.received).toBe(true);
    }, 10000);
  });

  describe('Edge cases', () => {
    it('should handle empty objects', () => {
      return request(server)
        .post('/reliable/echo')
        .send({})
        .expect(201)
        .expect(res => {
          expect(res.body.received).toEqual({});
        });
    });

    it('should handle nested arrays', () => {
      const nestedData = {
        matrix: [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9],
        ],
      };

      return request(server)
        .post('/reliable/echo')
        .send(nestedData)
        .expect(201)
        .expect(res => {
          expect(res.body.received).toEqual(nestedData);
        });
    });

    it('should handle boolean and null values', () => {
      const mixedData = {
        bool: true,
        nullValue: null,
        number: 42,
        string: 'test',
      };

      return request(server)
        .post('/reliable/echo')
        .send(mixedData)
        .expect(201)
        .expect(res => {
          expect(res.body.received).toEqual(mixedData);
        });
    });
  });
});
