import { ChunkingHandler } from './chunking.handler';
import { CompressionCodecType } from '../../compression';

describe('ChunkingHandler', () => {
  let handler: ChunkingHandler;

  beforeEach(() => {
    handler = new ChunkingHandler({
      chunkSize: 100,
      reassemblyTimeout: 30000,
    });
  });

  describe('createChunks', () => {
    it('should split string into chunks', () => {
      const data = 'x'.repeat(250);
      const chunks = handler.createChunks(data);

      expect(chunks.length).toBe(3); // 250 bytes / 100 = 3 chunks
      expect(chunks[0]).toBeTruthy();
      expect(chunks[1]).toBeTruthy();
      expect(chunks[2]).toBeTruthy();
    });

    it('should split buffer into chunks', () => {
      const buffer = Buffer.from('x'.repeat(250));
      const chunks = handler.createChunks(buffer);

      expect(chunks.length).toBe(3);
    });

    it('should create single chunk for small data', () => {
      const data = 'small';
      const chunks = handler.createChunks(data);

      expect(chunks.length).toBe(1);
    });

    it('should handle exact chunk size boundary', () => {
      const data = 'x'.repeat(100);
      const chunks = handler.createChunks(data);

      expect(chunks.length).toBe(1);
    });

    it('should encode chunks as base64', () => {
      const data = 'test data';
      const chunks = handler.createChunks(data);

      expect(chunks[0]).toBe(Buffer.from('test data').toString('base64'));
    });

    it('should split large data into multiple chunks', () => {
      const data = 'x'.repeat(1000);
      const chunks = handler.createChunks(data);

      expect(chunks.length).toBe(10); // 1000 / 100
    });

    it('should handle data not evenly divisible by chunk size', () => {
      const data = 'x'.repeat(255);
      const chunks = handler.createChunks(data);

      expect(chunks.length).toBe(3); // ceil(255 / 100)

      // Verify all chunks contain data
      chunks.forEach(chunk => {
        expect(chunk.length).toBeGreaterThan(0);
      });
    });
  });

  describe('initAssembly', () => {
    it('should initialize assembly structure', () => {
      handler.initAssembly('msg-123', 5);
      const assembly = handler.getAssembly('msg-123');

      expect(assembly).toBeDefined();
      expect(assembly!.totalChunks).toBe(5);
      expect(assembly!.receivedCount).toBe(0);
      expect(assembly!.chunks.length).toBe(5);
      expect(assembly!.chunks.every(chunk => chunk === null)).toBe(true);
    });

    it('should store remote info', () => {
      const remoteInfo = { address: '127.0.0.1', port: 3000 };
      handler.initAssembly('msg-123', 5, remoteInfo);
      const assembly = handler.getAssembly('msg-123');

      expect(assembly!.remoteInfo).toEqual(remoteInfo);
    });

    it('should store compression codec', () => {
      handler.initAssembly('msg-123', 5, undefined, CompressionCodecType.GZIP);
      const assembly = handler.getAssembly('msg-123');

      expect(assembly!.compressionCodec).toBe(CompressionCodecType.GZIP);
    });

    it('should set timestamp', () => {
      const before = Date.now();
      handler.initAssembly('msg-123', 5);
      const after = Date.now();
      const assembly = handler.getAssembly('msg-123');

      expect(assembly!.timestamp).toBeGreaterThanOrEqual(before);
      expect(assembly!.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('addChunk', () => {
    beforeEach(() => {
      handler.initAssembly('msg-123', 3);
    });

    it('should add chunk at correct index', () => {
      handler.addChunk('msg-123', 0, 'chunk-0-data');
      const assembly = handler.getAssembly('msg-123');

      expect(assembly!.chunks[0]).toBe('chunk-0-data');
      expect(assembly!.receivedCount).toBe(1);
    });

    it('should return false when not complete', () => {
      const complete = handler.addChunk('msg-123', 0, 'chunk-0-data');
      expect(complete).toBe(false);
    });

    it('should return true when all chunks received', () => {
      handler.addChunk('msg-123', 0, 'chunk-0-data');
      handler.addChunk('msg-123', 1, 'chunk-1-data');
      const complete = handler.addChunk('msg-123', 2, 'chunk-2-data');

      expect(complete).toBe(true);

      const assembly = handler.getAssembly('msg-123');
      expect(assembly!.receivedCount).toBe(3);
    });

    it('should handle chunks arriving out of order', () => {
      handler.addChunk('msg-123', 2, 'chunk-2-data');
      handler.addChunk('msg-123', 0, 'chunk-0-data');
      const complete = handler.addChunk('msg-123', 1, 'chunk-1-data');

      expect(complete).toBe(true);

      const assembly = handler.getAssembly('msg-123');
      expect(assembly!.chunks[0]).toBe('chunk-0-data');
      expect(assembly!.chunks[1]).toBe('chunk-1-data');
      expect(assembly!.chunks[2]).toBe('chunk-2-data');
    });

    it('should ignore duplicate chunks', () => {
      handler.addChunk('msg-123', 0, 'chunk-0-data');
      handler.addChunk('msg-123', 0, 'duplicate-data');

      const assembly = handler.getAssembly('msg-123');
      expect(assembly!.chunks[0]).toBe('chunk-0-data'); // Original data preserved
      expect(assembly!.receivedCount).toBe(1); // Count not incremented
    });

    it('should return false for non-existent assembly', () => {
      const result = handler.addChunk('non-existent', 0, 'data');
      expect(result).toBe(false);
    });
  });

  describe('getAssembledData', () => {
    it('should reassemble chunks into original data', () => {
      const original = 'This is a test message that will be chunked';
      const chunks = handler.createChunks(original);

      handler.initAssembly('msg-123', chunks.length);
      chunks.forEach((chunk, index) => {
        handler.addChunk('msg-123', index, chunk);
      });

      const assembled = handler.getAssembledData('msg-123');
      expect(assembled).toBeDefined();
      expect(assembled!.data.toString('utf8')).toBe(original);
    });

    it('should return null for incomplete assembly', () => {
      handler.initAssembly('msg-123', 3);
      handler.addChunk('msg-123', 0, 'chunk-0-data');
      handler.addChunk('msg-123', 1, 'chunk-1-data');
      // Missing chunk 2

      const assembled = handler.getAssembledData('msg-123');
      expect(assembled).toBeNull();
    });

    it('should return null for non-existent assembly', () => {
      const assembled = handler.getAssembledData('non-existent');
      expect(assembled).toBeNull();
    });

    it('should include compression codec if set', () => {
      const original = 'test data';
      const chunks = handler.createChunks(original);

      handler.initAssembly(
        'msg-123',
        chunks.length,
        undefined,
        CompressionCodecType.GZIP,
      );
      chunks.forEach((chunk, index) => {
        handler.addChunk('msg-123', index, chunk);
      });

      const assembled = handler.getAssembledData('msg-123');
      expect(assembled!.compressionCodec).toBe(CompressionCodecType.GZIP);
    });

    it('should handle large reassembled data', () => {
      const original = 'x'.repeat(10000);
      const chunks = handler.createChunks(original);

      handler.initAssembly('msg-123', chunks.length);
      chunks.forEach((chunk, index) => {
        handler.addChunk('msg-123', index, chunk);
      });

      const assembled = handler.getAssembledData('msg-123');
      expect(assembled).toBeDefined();
      expect(assembled!.data.toString('utf8')).toBe(original);
      expect(assembled!.data.length).toBe(10000);
    });

    it('should return null when missing chunks', () => {
      handler.initAssembly('msg-123', 5);
      // Intentionally create a scenario with missing chunks
      handler.addChunk('msg-123', 0, Buffer.from('chunk0').toString('base64'));
      handler.addChunk('msg-123', 2, Buffer.from('chunk2').toString('base64'));
      // Manually set receivedCount to equal totalChunks to test missing chunk detection
      const assembly = handler.getAssembly('msg-123');
      assembly!.receivedCount = 5; // Fake complete count

      const assembled = handler.getAssembledData('msg-123');
      expect(assembled).toBeNull(); // Should detect missing chunks
    });
  });

  describe('chunk/reassemble round-trip', () => {
    it('should maintain data integrity', () => {
      const original = 'The quick brown fox jumps over the lazy dog. '.repeat(
        10,
      );
      const chunks = handler.createChunks(original);

      handler.initAssembly('msg-123', chunks.length);
      chunks.forEach((chunk, index) => {
        handler.addChunk('msg-123', index, chunk);
      });

      const assembled = handler.getAssembledData('msg-123');
      expect(assembled!.data.toString('utf8')).toBe(original);
    });

    it('should handle binary data', () => {
      const binaryData = Buffer.from([0, 1, 2, 3, 255, 254, 253]);
      const chunks = handler.createChunks(binaryData);

      handler.initAssembly('msg-123', chunks.length);
      chunks.forEach((chunk, index) => {
        handler.addChunk('msg-123', index, chunk);
      });

      const assembled = handler.getAssembledData('msg-123');
      expect(assembled!.data).toEqual(binaryData);
    });

    it('should handle UTF-8 characters', () => {
      const original = 'Hello 世界 🌍 مرحبا';
      const chunks = handler.createChunks(original);

      handler.initAssembly('msg-123', chunks.length);
      chunks.forEach((chunk, index) => {
        handler.addChunk('msg-123', index, chunk);
      });

      const assembled = handler.getAssembledData('msg-123');
      expect(assembled!.data.toString('utf8')).toBe(original);
    });
  });

  describe('removeAssembly', () => {
    it('should remove assembly', () => {
      handler.initAssembly('msg-123', 3);
      expect(handler.getAssembly('msg-123')).toBeDefined();

      const removed = handler.removeAssembly('msg-123');
      expect(removed).toBe(true);
      expect(handler.getAssembly('msg-123')).toBeUndefined();
    });

    it('should return false for non-existent assembly', () => {
      const removed = handler.removeAssembly('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('cleanupStaleAssemblies', () => {
    it('should remove stale assemblies', async () => {
      const shortTimeoutHandler = new ChunkingHandler({
        chunkSize: 100,
        reassemblyTimeout: 100, // 100ms timeout
      });

      shortTimeoutHandler.initAssembly('msg-old', 3);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      const cleanedCount = shortTimeoutHandler.cleanupStaleAssemblies();
      expect(cleanedCount).toBe(1);
      expect(shortTimeoutHandler.getAssembly('msg-old')).toBeUndefined();
    });

    it('should not remove fresh assemblies', () => {
      handler.initAssembly('msg-fresh', 3);
      const cleanedCount = handler.cleanupStaleAssemblies();

      expect(cleanedCount).toBe(0);
      expect(handler.getAssembly('msg-fresh')).toBeDefined();
    });

    it('should clean multiple stale assemblies', async () => {
      const shortTimeoutHandler = new ChunkingHandler({
        chunkSize: 100,
        reassemblyTimeout: 100,
      });

      shortTimeoutHandler.initAssembly('msg-old-1', 3);
      shortTimeoutHandler.initAssembly('msg-old-2', 3);
      shortTimeoutHandler.initAssembly('msg-old-3', 3);

      await new Promise(resolve => setTimeout(resolve, 150));

      const cleanedCount = shortTimeoutHandler.cleanupStaleAssemblies();
      expect(cleanedCount).toBe(3);
    });

    it('should clean only stale assemblies, keep fresh ones', async () => {
      const shortTimeoutHandler = new ChunkingHandler({
        chunkSize: 100,
        reassemblyTimeout: 100,
      });

      shortTimeoutHandler.initAssembly('msg-old', 3);
      await new Promise(resolve => setTimeout(resolve, 150));

      shortTimeoutHandler.initAssembly('msg-fresh', 3); // Created after timeout

      const cleanedCount = shortTimeoutHandler.cleanupStaleAssemblies();
      expect(cleanedCount).toBe(1);
      expect(shortTimeoutHandler.getAssembly('msg-old')).toBeUndefined();
      expect(shortTimeoutHandler.getAssembly('msg-fresh')).toBeDefined();
    });
  });

  describe('clear', () => {
    it('should clear all assemblies', () => {
      handler.initAssembly('msg-1', 3);
      handler.initAssembly('msg-2', 3);
      handler.initAssembly('msg-3', 3);

      handler.clear();

      expect(handler.getAssembly('msg-1')).toBeUndefined();
      expect(handler.getAssembly('msg-2')).toBeUndefined();
      expect(handler.getAssembly('msg-3')).toBeUndefined();
    });

    it('should allow new assemblies after clear', () => {
      handler.initAssembly('msg-1', 3);
      handler.clear();

      handler.initAssembly('msg-new', 3);
      expect(handler.getAssembly('msg-new')).toBeDefined();
    });
  });

  describe('different chunk sizes', () => {
    it('should respect configured chunk size', () => {
      const handler50 = new ChunkingHandler({
        chunkSize: 50,
        reassemblyTimeout: 30000,
      });

      const handler200 = new ChunkingHandler({
        chunkSize: 200,
        reassemblyTimeout: 30000,
      });

      const data = 'x'.repeat(100);

      const chunks50 = handler50.createChunks(data);
      const chunks200 = handler200.createChunks(data);

      expect(chunks50.length).toBe(2); // 100 / 50
      expect(chunks200.length).toBe(1); // 100 / 200
    });
  });
});
