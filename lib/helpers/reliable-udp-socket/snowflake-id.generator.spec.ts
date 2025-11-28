import { SnowflakeIdGenerator } from './snowflake-id.generator';
import {
  SNOWFLAKE_MAX_WORKER_ID,
  SNOWFLAKE_DEFAULT_EPOCH,
} from './reliable-udp-socket.constants';

describe('SnowflakeIdGenerator', () => {
  describe('constructor', () => {
    it('should create instance with valid worker ID', () => {
      expect(
        () =>
          new SnowflakeIdGenerator({
            workerId: 0,
            epoch: SNOWFLAKE_DEFAULT_EPOCH,
          }),
      ).not.toThrow();
      expect(
        () =>
          new SnowflakeIdGenerator({
            workerId: 512,
            epoch: SNOWFLAKE_DEFAULT_EPOCH,
          }),
      ).not.toThrow();
      expect(
        () =>
          new SnowflakeIdGenerator({
            workerId: 1023,
            epoch: SNOWFLAKE_DEFAULT_EPOCH,
          }),
      ).not.toThrow();
    });

    it('should throw error for invalid worker ID (negative)', () => {
      expect(
        () =>
          new SnowflakeIdGenerator({
            workerId: -1,
            epoch: SNOWFLAKE_DEFAULT_EPOCH,
          }),
      ).toThrow(`Worker ID must be between 0 and ${SNOWFLAKE_MAX_WORKER_ID}`);
    });

    it('should throw error for invalid worker ID (too large)', () => {
      expect(
        () =>
          new SnowflakeIdGenerator({
            workerId: 1024,
            epoch: SNOWFLAKE_DEFAULT_EPOCH,
          }),
      ).toThrow(`Worker ID must be between 0 and ${SNOWFLAKE_MAX_WORKER_ID}`);
    });
  });

  describe('generate', () => {
    it('should generate unique IDs', () => {
      const generator = new SnowflakeIdGenerator({
        workerId: 0,
        epoch: SNOWFLAKE_DEFAULT_EPOCH,
      });
      const id1 = generator.generate();
      const id2 = generator.generate();
      const id3 = generator.generate();

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id3).toBeTruthy();
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should generate string IDs', () => {
      const generator = new SnowflakeIdGenerator({
        workerId: 0,
        epoch: SNOWFLAKE_DEFAULT_EPOCH,
      });
      const id = generator.generate();

      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should generate IDs with different worker IDs', () => {
      const generator1 = new SnowflakeIdGenerator({
        workerId: 0,
        epoch: SNOWFLAKE_DEFAULT_EPOCH,
      });
      const generator2 = new SnowflakeIdGenerator({
        workerId: 1,
        epoch: SNOWFLAKE_DEFAULT_EPOCH,
      });

      const id1 = generator1.generate();
      const id2 = generator2.generate();

      expect(id1).not.toBe(id2);
    });

    it('should handle sequence overflow within same millisecond', () => {
      const generator = new SnowflakeIdGenerator({
        workerId: 0,
        epoch: SNOWFLAKE_DEFAULT_EPOCH,
      });
      const ids = new Set<string>();

      // Generate multiple IDs in quick succession
      for (let i = 0; i < 100; i++) {
        ids.add(generator.generate());
      }

      expect(ids.size).toBe(100); // All IDs should be unique
    });

    it('should throw error when clock moves backwards', () => {
      const generator = new SnowflakeIdGenerator({
        workerId: 0,
        epoch: SNOWFLAKE_DEFAULT_EPOCH,
      });

      // Generate an ID to set _lastTimestamp
      generator.generate();

      // Mock Date.now to return a past timestamp
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => 0); // Return a timestamp in the past

      expect(() => generator.generate()).toThrow(
        'Clock moved backwards. Refusing to generate ID.',
      );

      // Restore original Date.now
      Date.now = originalDateNow;
    });
  });

  describe('parse', () => {
    it('should correctly parse generated ID', () => {
      const workerId = 42;
      const generator = new SnowflakeIdGenerator({
        workerId,
        epoch: SNOWFLAKE_DEFAULT_EPOCH,
      });
      const id = generator.generate();

      const parsed = generator.parse(id);

      expect(parsed.workerId).toBe(workerId);
      expect(parsed.sequence).toBeGreaterThanOrEqual(0);
      expect(parsed.sequence).toBeLessThanOrEqual(4095);
      expect(parsed.timestamp).toBeGreaterThan(0);
    });

    it('should parse timestamp correctly', () => {
      const generator = new SnowflakeIdGenerator({
        workerId: 0,
        epoch: SNOWFLAKE_DEFAULT_EPOCH,
      });
      const beforeGeneration = Date.now();
      const id = generator.generate();
      const afterGeneration = Date.now();

      const parsed = generator.parse(id);

      // Timestamp should be within the generation window
      expect(parsed.timestamp).toBeGreaterThanOrEqual(beforeGeneration);
      expect(parsed.timestamp).toBeLessThanOrEqual(afterGeneration);
    });

    it('should parse multiple IDs with incrementing sequence', () => {
      const generator = new SnowflakeIdGenerator({
        workerId: 0,
        epoch: SNOWFLAKE_DEFAULT_EPOCH,
      });

      // Generate IDs quickly to get sequence increments
      const id1 = generator.generate();
      const id2 = generator.generate();

      const parsed1 = generator.parse(id1);
      const parsed2 = generator.parse(id2);

      // Both should have same worker ID
      expect(parsed1.workerId).toBe(0);
      expect(parsed2.workerId).toBe(0);

      // If generated in same millisecond, sequence should increment
      if (parsed1.timestamp === parsed2.timestamp) {
        expect(parsed2.sequence).toBe(parsed1.sequence + 1);
      }
    });
  });

  describe('custom epoch', () => {
    it('should use custom epoch', () => {
      const customEpoch = 1700000000000n; // Custom epoch
      const generator = new SnowflakeIdGenerator({
        workerId: 0,
        epoch: customEpoch,
      });
      const id = generator.generate();
      const parsed = generator.parse(id);

      // Timestamp should be reasonable (not too far in past/future)
      const now = Date.now();
      expect(parsed.timestamp).toBeGreaterThan(Number(customEpoch));
      expect(parsed.timestamp).toBeLessThanOrEqual(now + 1000); // Allow 1 second buffer
    });
  });

  describe('concurrent generation', () => {
    it('should generate unique IDs across multiple generators', () => {
      const generator1 = new SnowflakeIdGenerator({
        workerId: 0,
        epoch: SNOWFLAKE_DEFAULT_EPOCH,
      });
      const generator2 = new SnowflakeIdGenerator({
        workerId: 1,
        epoch: SNOWFLAKE_DEFAULT_EPOCH,
      });
      const generator3 = new SnowflakeIdGenerator({
        workerId: 2,
        epoch: SNOWFLAKE_DEFAULT_EPOCH,
      });

      const ids = new Set<string>();

      // Generate IDs from all generators
      for (let i = 0; i < 10; i++) {
        ids.add(generator1.generate());
        ids.add(generator2.generate());
        ids.add(generator3.generate());
      }

      // All IDs should be unique
      expect(ids.size).toBe(30);
    });
  });
});
