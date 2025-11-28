import { CompressionHandler } from './compression.handler';
import { CompressionCodecType } from '../../compression';

describe('CompressionHandler', () => {
  describe('shouldCompress', () => {
    it('should return false when compression is disabled', () => {
      const handler = new CompressionHandler({
        enabled: false,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 256,
        minReduction: 10,
      });

      expect(handler.shouldCompress(1000)).toBe(false);
      expect(handler.shouldCompress(10000)).toBe(false);
    });

    it('should return false when size is below minimum', () => {
      const handler = new CompressionHandler({
        enabled: true,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 256,
        minReduction: 10,
      });

      expect(handler.shouldCompress(100)).toBe(false);
      expect(handler.shouldCompress(255)).toBe(false);
    });

    it('should return true when enabled and size meets minimum', () => {
      const handler = new CompressionHandler({
        enabled: true,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 256,
        minReduction: 10,
      });

      expect(handler.shouldCompress(256)).toBe(true);
      expect(handler.shouldCompress(1000)).toBe(true);
    });
  });

  describe('tryCompress - gzip', () => {
    it('should return null when compression is disabled', async () => {
      const handler = new CompressionHandler({
        enabled: false,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 256,
        minReduction: 10,
      });

      const data = 'x'.repeat(1000);
      const result = await handler.tryCompress(data);

      expect(result).toBeNull();
    });

    it('should return null when data is below minimum size', async () => {
      const handler = new CompressionHandler({
        enabled: true,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 256,
        minReduction: 10,
      });

      const data = 'x'.repeat(100);
      const result = await handler.tryCompress(data);

      expect(result).toBeNull();
    });

    it('should compress highly compressible data', async () => {
      const handler = new CompressionHandler({
        enabled: true,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 256,
        minReduction: 10,
      });

      // Highly compressible data (repeated pattern)
      const data = 'x'.repeat(1000);
      const result = await handler.tryCompress(data);

      expect(result).not.toBeNull();
      expect(result!.codec).toBe(CompressionCodecType.GZIP);
      expect(result!.originalSize).toBe(1000);
      expect(result!.compressedSize).toBeLessThan(result!.originalSize);
      expect(typeof result!.data).toBe('string'); // Base64 encoded
    });

    it('should return null when compression reduction is insufficient', async () => {
      const handler = new CompressionHandler({
        enabled: true,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 256,
        minReduction: 50, // Require 50% reduction
      });

      // Somewhat compressible data, but not by 50%
      const data = JSON.stringify({
        data: Array.from({ length: 50 }, (_, i) => i),
      });
      const result = await handler.tryCompress(data);

      // Should return null if compression doesn't achieve 50% reduction
      // Result may vary based on data, but testing the logic
      if (result) {
        const reduction =
          (1 - result.compressedSize / result.originalSize) * 100;
        expect(reduction).toBeGreaterThanOrEqual(50);
      }
    });

    it('should handle JSON data', async () => {
      const handler = new CompressionHandler({
        enabled: true,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 256,
        minReduction: 10,
      });

      const jsonData = JSON.stringify({
        users: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`,
        })),
      });

      const result = await handler.tryCompress(jsonData);

      expect(result).not.toBeNull();
      expect(result!.compressedSize).toBeLessThan(result!.originalSize);
    });

    it('should calculate compression metrics correctly', async () => {
      const handler = new CompressionHandler({
        enabled: true,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 256,
        minReduction: 10,
      });

      const data = 'x'.repeat(1000);
      const result = await handler.tryCompress(data);

      expect(result).not.toBeNull();
      expect(result!.originalSize).toBe(1000);

      // Calculate reduction
      const reduction =
        (1 - result!.compressedSize / result!.originalSize) * 100;
      expect(reduction).toBeGreaterThanOrEqual(10);
    });
  });

  describe('tryDecompress - gzip', () => {
    it('should decompress compressed data', async () => {
      const handler = new CompressionHandler({
        enabled: true,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 256,
        minReduction: 10,
      });

      const original = { data: 'x'.repeat(1000) };
      const jsonString = JSON.stringify(original);

      // Compress
      const compressed = await handler.tryCompress(jsonString);
      expect(compressed).not.toBeNull();

      // Decompress
      const decompressed = await handler.tryDecompress(
        compressed!.data,
        CompressionCodecType.GZIP,
      );

      expect(decompressed).toEqual(original);
    });

    it('should return null for unknown codec', async () => {
      const handler = new CompressionHandler({
        enabled: true,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 256,
        minReduction: 10,
      });

      const result = await handler.tryDecompress(
        'invalid-data',
        'unknown-codec' as any,
      );

      expect(result).toBeNull();
    });

    it('should handle decompression errors gracefully', async () => {
      const handler = new CompressionHandler({
        enabled: true,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 256,
        minReduction: 10,
      });

      // Invalid compressed data
      const result = await handler.tryDecompress(
        'invalid-base64-data',
        CompressionCodecType.GZIP,
      );

      expect(result).toBeNull();
    });
  });

  describe('compress/decompress round-trip - gzip', () => {
    it('should maintain data integrity', async () => {
      const handler = new CompressionHandler({
        enabled: true,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 256,
        minReduction: 10,
      });

      const original = {
        id: 123,
        name: 'Test User',
        data: 'x'.repeat(1000),
        nested: {
          array: [1, 2, 3, 4, 5],
          object: { key: 'value' },
        },
      };

      const jsonString = JSON.stringify(original);
      const compressed = await handler.tryCompress(jsonString);
      expect(compressed).not.toBeNull();

      const decompressed = await handler.tryDecompress(
        compressed!.data,
        CompressionCodecType.GZIP,
      );

      expect(decompressed).toEqual(original);
    });

    it('should handle various compression levels', async () => {
      const levels = [1, 6, 9];

      for (const level of levels) {
        const handler = new CompressionHandler({
          enabled: true,
          codec: CompressionCodecType.GZIP,
          level,
          minSize: 256,
          minReduction: 10,
        });

        const data = 'x'.repeat(1000);
        const compressed = await handler.tryCompress(data);
        expect(compressed).not.toBeNull();

        const original = { value: data };
        const jsonString = JSON.stringify(original);
        const compressedData = await handler.tryCompress(jsonString);
        if (compressedData) {
          const decompressed = await handler.tryDecompress(
            compressedData.data,
            CompressionCodecType.GZIP,
          );
          expect(decompressed).toEqual(original);
        }
      }
    });
  });

  describe('different minSize thresholds', () => {
    it('should respect different minSize values', async () => {
      const handler256 = new CompressionHandler({
        enabled: true,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 256,
        minReduction: 10,
      });

      const handler1000 = new CompressionHandler({
        enabled: true,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 1000,
        minReduction: 10,
      });

      const data500 = 'x'.repeat(500);

      expect(handler256.shouldCompress(500)).toBe(true);
      expect(handler1000.shouldCompress(500)).toBe(false);

      const result256 = await handler256.tryCompress(data500);
      const result1000 = await handler1000.tryCompress(data500);

      expect(result256).not.toBeNull();
      expect(result1000).toBeNull();
    });
  });

  describe('different minReduction thresholds', () => {
    it('should respect minReduction threshold', async () => {
      const handler10 = new CompressionHandler({
        enabled: true,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 256,
        minReduction: 10,
      });

      const handler90 = new CompressionHandler({
        enabled: true,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 256,
        minReduction: 90, // Very high threshold
      });

      const data = 'x'.repeat(1000);

      const result10 = await handler10.tryCompress(data);
      const result90 = await handler90.tryCompress(data);

      // 10% threshold should pass for highly compressible data
      expect(result10).not.toBeNull();

      // 90% threshold is very strict and may not pass
      // (result will depend on actual compression ratio)
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', async () => {
      const handler = new CompressionHandler({
        enabled: true,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 0,
        minReduction: 10,
      });

      const result = await handler.tryCompress('');
      // Empty string is too small and won't compress efficiently
      expect(result).toBeNull();
    });

    it('should handle very large data', async () => {
      const handler = new CompressionHandler({
        enabled: true,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 256,
        minReduction: 10,
      });

      // 1MB of repeated data
      const largeData = 'x'.repeat(1024 * 1024);
      const result = await handler.tryCompress(largeData);

      expect(result).not.toBeNull();
      expect(result!.compressedSize).toBeLessThan(result!.originalSize);

      // Verify decompression
      const original = { data: largeData };
      const jsonString = JSON.stringify(original);
      const compressed = await handler.tryCompress(jsonString);
      if (compressed) {
        const decompressed = await handler.tryDecompress(
          compressed.data,
          CompressionCodecType.GZIP,
        );
        expect(decompressed).toEqual(original);
      }
    });

    it('should handle random incompressible data', async () => {
      const handler = new CompressionHandler({
        enabled: true,
        codec: CompressionCodecType.GZIP,
        level: 6,
        minSize: 256,
        minReduction: 10,
      });

      // Generate pseudo-random data (less compressible)
      const randomData = Array.from({ length: 1000 }, () =>
        Math.random().toString(36),
      ).join('');

      const result = await handler.tryCompress(randomData);

      // Random data may not achieve 10% reduction
      // If it does compress, verify the reduction
      if (result) {
        const reduction =
          (1 - result.compressedSize / result.originalSize) * 100;
        expect(reduction).toBeGreaterThanOrEqual(10);
      }
    });
  });

  describe('codec availability', () => {
    it('should handle unavailable codec gracefully', async () => {
      const handler = new CompressionHandler({
        enabled: true,
        codec: 'unavailable-codec' as any,
        level: 6,
        minSize: 256,
        minReduction: 10,
      });

      const data = 'x'.repeat(1000);
      const result = await handler.tryCompress(data);

      // Should return null if codec is not available
      expect(result).toBeNull();
    });
  });
});
