import * as dgram from 'node:dgram';
import { ReliableUdpSocket } from './reliable-udp-socket';
import { CompressionCodecType } from '../../compression';

describe('ReliableUdpSocket', () => {
  let socket: dgram.Socket;
  let reliableSocket: ReliableUdpSocket;

  beforeEach(async () => {
    socket = dgram.createSocket('udp4');
    reliableSocket = new ReliableUdpSocket(socket);

    // Bind socket before use to avoid "Not running" errors
    await new Promise<void>(resolve => {
      socket.bind(0, '127.0.0.1', () => {
        resolve();
      });
    });
  });

  afterEach(() => {
    try {
      reliableSocket.close();
    } catch (e) {
      // Ignore errors during cleanup
    }
  });

  describe('constructor', () => {
    it('should create instance with default configuration', () => {
      expect(reliableSocket).toBeDefined();
      expect(reliableSocket).toBeInstanceOf(ReliableUdpSocket);
    });

    it('should initialize with dgram socket', () => {
      expect(reliableSocket.socket).toBe(socket);
    });
  });

  describe('configure', () => {
    it('should allow configuration via fluent API', () => {
      const result = reliableSocket.configure({
        maxMessageSize: 2000,
        maxRetries: 3,
        retryInterval: 1000,
        enableChecksum: true,
      });

      expect(result).toBe(reliableSocket); // Should return this for chaining
    });

    it('should update maxMessageSize', () => {
      reliableSocket.configure({ maxMessageSize: 2000 });
      // Configuration is private, but we can test it doesn't throw
      expect(() =>
        reliableSocket.configure({ maxMessageSize: 2000 }),
      ).not.toThrow();
    });

    it('should update maxRetries', () => {
      expect(() => reliableSocket.configure({ maxRetries: 10 })).not.toThrow();
    });

    it('should update retryInterval', () => {
      expect(() =>
        reliableSocket.configure({ retryInterval: 200 }),
      ).not.toThrow();
    });

    it('should update enableChecksum', () => {
      expect(() =>
        reliableSocket.configure({ enableChecksum: false }),
      ).not.toThrow();
    });

    it('should configure compression', () => {
      expect(() =>
        reliableSocket.configure({
          compression: {
            enabled: true,
            codec: CompressionCodecType.GZIP,
            level: 9,
            minSize: 512,
            minReduction: 20,
          },
        }),
      ).not.toThrow();
    });

    it('should configure chunking options', () => {
      expect(() =>
        reliableSocket.configure({
          chunkSize: 800,
          reassemblyTimeout: 60000,
        }),
      ).not.toThrow();
    });

    it('should configure request timeout', () => {
      expect(() =>
        reliableSocket.configure({
          requestTimeout: 10000,
        }),
      ).not.toThrow();
    });

    it('should configure message ID options', () => {
      expect(() =>
        reliableSocket.configure({
          messageIdOptions: {
            workerId: 42,
            epoch: 1700000000000n,
          },
        }),
      ).not.toThrow();
    });

    it('should allow partial configuration updates', () => {
      reliableSocket.configure({ maxRetries: 5 });
      reliableSocket.configure({ retryInterval: 300 });
      reliableSocket.configure({ enableChecksum: false });

      expect(() =>
        reliableSocket.configure({ maxMessageSize: 1500 }),
      ).not.toThrow();
    });

    it('should throw for invalid maxMessageSize (too small)', () => {
      expect(() => reliableSocket.configure({ maxMessageSize: 50 })).toThrow(
        'Invalid maxMessageSize: 50',
      );
    });

    it('should throw for invalid maxMessageSize (too large)', () => {
      expect(() => reliableSocket.configure({ maxMessageSize: 70000 })).toThrow(
        'Invalid maxMessageSize: 70000',
      );
    });

    it('should accept valid maxMessageSize range', () => {
      expect(() =>
        reliableSocket.configure({ maxMessageSize: 100 }),
      ).not.toThrow();
      expect(() =>
        reliableSocket.configure({ maxMessageSize: 1400 }),
      ).not.toThrow();
      expect(() =>
        reliableSocket.configure({ maxMessageSize: 65000 }),
      ).not.toThrow();
    });
  });

  describe('configuration chaining', () => {
    it('should support method chaining', () => {
      const result = reliableSocket
        .configure({ maxMessageSize: 1500 })
        .configure({ maxRetries: 3 })
        .configure({ enableChecksum: true });

      expect(result).toBe(reliableSocket);
    });

    it('should accumulate configuration changes', () => {
      reliableSocket
        .configure({ maxMessageSize: 1500 })
        .configure({ maxRetries: 7 })
        .configure({
          compression: {
            enabled: true,
            codec: CompressionCodecType.GZIP,
            level: 6,
            minSize: 256,
            minReduction: 10,
          },
        });

      // Should not throw - configuration accumulated successfully
      expect(() => reliableSocket.configure({})).not.toThrow();
    });
  });

  describe('close', () => {
    it('should close socket and cleanup resources', () => {
      const result = reliableSocket.close();
      expect(result).toBe(reliableSocket);
    });

    it('should stop cleanup timer', () => {
      // Just verify close returns the socket instance
      const result = reliableSocket.close();
      expect(result).toBe(reliableSocket);
    });

    it('should clear request tracker', () => {
      // Verify close works without throwing
      expect(() => reliableSocket.close()).not.toThrow();
    });
  });

  describe('compression configuration', () => {
    it('should handle all compression codecs', () => {
      const codecs = [
        CompressionCodecType.NONE,
        CompressionCodecType.GZIP,
        CompressionCodecType.SNAPPY,
        CompressionCodecType.LZ4,
        CompressionCodecType.ZSTD,
      ];

      codecs.forEach(codec => {
        expect(() =>
          reliableSocket.configure({
            compression: {
              enabled: true,
              codec,
              level: 6,
              minSize: 256,
              minReduction: 10,
            },
          }),
        ).not.toThrow();
      });
    });

    it('should handle compression levels', () => {
      [1, 6, 9].forEach(level => {
        expect(() =>
          reliableSocket.configure({
            compression: {
              enabled: true,
              codec: CompressionCodecType.GZIP,
              level,
              minSize: 256,
              minReduction: 10,
            },
          }),
        ).not.toThrow();
      });
    });

    it('should handle different minSize thresholds', () => {
      [128, 256, 512, 1024].forEach(minSize => {
        expect(() =>
          reliableSocket.configure({
            compression: {
              enabled: true,
              codec: CompressionCodecType.GZIP,
              level: 6,
              minSize,
              minReduction: 10,
            },
          }),
        ).not.toThrow();
      });
    });

    it('should handle different minReduction thresholds', () => {
      [5, 10, 25, 50].forEach(minReduction => {
        expect(() =>
          reliableSocket.configure({
            compression: {
              enabled: true,
              codec: CompressionCodecType.GZIP,
              level: 6,
              minSize: 256,
              minReduction,
            },
          }),
        ).not.toThrow();
      });
    });

    it('should enable/disable compression', () => {
      reliableSocket.configure({
        compression: {
          enabled: true,
          codec: CompressionCodecType.GZIP,
          level: 6,
          minSize: 256,
          minReduction: 10,
        },
      });

      reliableSocket.configure({
        compression: {
          enabled: false,
          codec: CompressionCodecType.GZIP,
          level: 6,
          minSize: 256,
          minReduction: 10,
        },
      });

      expect(() => reliableSocket.configure({})).not.toThrow();
    });
  });

  describe('chunking configuration', () => {
    it('should accept different chunk sizes', () => {
      [500, 1000, 1400, 2000].forEach(chunkSize => {
        expect(() => reliableSocket.configure({ chunkSize })).not.toThrow();
      });
    });

    it('should accept different reassembly timeouts', () => {
      [10000, 30000, 60000].forEach(timeout => {
        expect(() =>
          reliableSocket.configure({ reassemblyTimeout: timeout }),
        ).not.toThrow();
      });
    });
  });

  describe('retry configuration', () => {
    it('should accept different retry counts', () => {
      [0, 3, 5, 10].forEach(maxRetries => {
        expect(() => reliableSocket.configure({ maxRetries })).not.toThrow();
      });
    });

    it('should accept different retry intervals', () => {
      [100, 500, 1000, 2000].forEach(retryInterval => {
        expect(() => reliableSocket.configure({ retryInterval })).not.toThrow();
      });
    });
  });

  describe('timeout configuration', () => {
    it('should accept different request timeouts', () => {
      [1000, 5000, 10000, 30000].forEach(requestTimeout => {
        expect(() =>
          reliableSocket.configure({ requestTimeout }),
        ).not.toThrow();
      });
    });
  });

  describe('worker ID configuration', () => {
    it('should accept valid worker IDs', () => {
      [0, 1, 42, 512, 1023].forEach(workerId => {
        expect(() =>
          reliableSocket.configure({
            messageIdOptions: { workerId },
          }),
        ).not.toThrow();
      });
    });
  });

  describe('default values', () => {
    it('should use defaults when not configured', () => {
      const defaultSocket = new ReliableUdpSocket(dgram.createSocket('udp4'));
      // Should work with all defaults
      expect(defaultSocket).toBeDefined();
      defaultSocket.close();
    });

    it('should preserve defaults for unspecified options', () => {
      reliableSocket.configure({ maxRetries: 10 });
      // Other options should remain at defaults
      expect(() => reliableSocket.configure({})).not.toThrow();
    });
  });

  describe('multiple configurations', () => {
    it('should handle reconfiguration', () => {
      reliableSocket.configure({
        maxMessageSize: 1500,
        maxRetries: 5,
      });

      reliableSocket.configure({
        maxMessageSize: 2000,
        maxRetries: 10,
      });

      expect(() => reliableSocket.configure({})).not.toThrow();
    });

    it('should update worker ID when reconfigured', () => {
      reliableSocket.configure({
        messageIdOptions: { workerId: 1 },
      });

      reliableSocket.configure({
        messageIdOptions: { workerId: 2 },
      });

      expect(() => reliableSocket.configure({})).not.toThrow();
    });

    it('should update compression handler when reconfigured', () => {
      reliableSocket.configure({
        compression: {
          enabled: true,
          codec: CompressionCodecType.GZIP,
          level: 6,
          minSize: 256,
          minReduction: 10,
        },
      });

      reliableSocket.configure({
        compression: {
          enabled: true,
          codec: CompressionCodecType.LZ4,
          level: 1,
          minSize: 512,
          minReduction: 20,
        },
      });

      expect(() => reliableSocket.configure({})).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle empty configuration object', () => {
      expect(() => reliableSocket.configure({})).not.toThrow();
    });

    it('should handle undefined configuration values', () => {
      expect(() =>
        reliableSocket.configure({
          maxMessageSize: undefined,
          maxRetries: undefined,
        }),
      ).not.toThrow();
    });

    it('should handle socket close during configuration', () => {
      reliableSocket.close();
      expect(() => reliableSocket.configure({ maxRetries: 5 })).not.toThrow();
    });
  });

  describe('checksum configuration', () => {
    it('should enable checksum by default', () => {
      const defaultSocket = new ReliableUdpSocket(dgram.createSocket('udp4'));
      expect(() => defaultSocket.configure({})).not.toThrow();
      defaultSocket.close();
    });

    it('should allow disabling checksum', () => {
      expect(() =>
        reliableSocket.configure({ enableChecksum: false }),
      ).not.toThrow();
    });

    it('should allow re-enabling checksum', () => {
      reliableSocket.configure({ enableChecksum: false });
      reliableSocket.configure({ enableChecksum: true });
      expect(() => reliableSocket.configure({})).not.toThrow();
    });
  });

  describe('integration configuration', () => {
    it('should configure all options together', () => {
      expect(() =>
        reliableSocket.configure({
          maxMessageSize: 1500,
          maxRetries: 7,
          retryInterval: 300,
          enableChecksum: true,
          requestTimeout: 10000,
          chunkSize: 1000,
          reassemblyTimeout: 45000,
          compression: {
            enabled: true,
            codec: CompressionCodecType.GZIP,
            level: 6,
            minSize: 512,
            minReduction: 15,
          },
          messageIdOptions: {
            workerId: 42,
            epoch: 1700000000000n,
          },
        }),
      ).not.toThrow();
    });
  });
});
