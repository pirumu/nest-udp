import { MessageEnvelopeHandler } from './message-envelope.handler';
import { MessageType, CodecIndex } from './reliable-udp-socket.types';
import { CompressionCodecType } from '../../compression';

describe('MessageEnvelopeHandler', () => {
  let handler: MessageEnvelopeHandler;

  beforeEach(() => {
    handler = new MessageEnvelopeHandler();
  });

  describe('encodeFlags', () => {
    it('should encode REQ message with no compression', () => {
      const flags = handler.encodeFlags(
        MessageType.REQ,
        CompressionCodecType.NONE,
        false,
        false,
      );

      // REQ = 0b00, no compression, no chunking, codec = 0
      // Bits: 00000000 = 0
      expect(flags).toBe(0);
    });

    it('should encode ACK message', () => {
      const flags = handler.encodeFlags(
        MessageType.ACK,
        CompressionCodecType.NONE,
        false,
        false,
      );

      // ACK = 0b01, type bits at position 5-6
      // Bits: 00100000 = 32
      expect(flags).toBe(32);
    });

    it('should encode RES message', () => {
      const flags = handler.encodeFlags(
        MessageType.RES,
        CompressionCodecType.NONE,
        false,
        false,
      );

      // RES = 0b10, type bits at position 5-6
      // Bits: 01000000 = 64
      expect(flags).toBe(64);
    });

    it('should encode compression flag', () => {
      const flags = handler.encodeFlags(
        MessageType.REQ,
        CompressionCodecType.GZIP,
        true,
        false,
      );

      // REQ = 0b00, gzip = 1, compressed = bit 3, no chunking
      // Bits: 00001001 = 9
      expect(flags).toBe(9);
    });

    it('should encode chunked flag', () => {
      const flags = handler.encodeFlags(
        MessageType.REQ,
        CompressionCodecType.NONE,
        false,
        true,
      );

      // REQ = 0b00, no compression, chunked = bit 4
      // Bits: 00010000 = 16
      expect(flags).toBe(16);
    });

    it('should encode all flags together', () => {
      const flags = handler.encodeFlags(
        MessageType.REQ,
        CompressionCodecType.SNAPPY,
        true,
        true,
      );

      // REQ = 0b00, snappy = 2, compressed = bit 3, chunked = bit 4
      // Bits: 00011010 = 26
      expect(flags).toBe(26);
    });

    it('should encode different codecs', () => {
      const gzipFlags = handler.encodeFlags(
        MessageType.REQ,
        CompressionCodecType.GZIP,
        false,
        false,
      );
      const snappyFlags = handler.encodeFlags(
        MessageType.REQ,
        CompressionCodecType.SNAPPY,
        false,
        false,
      );
      const lz4Flags = handler.encodeFlags(
        MessageType.REQ,
        CompressionCodecType.LZ4,
        false,
        false,
      );
      const zstdFlags = handler.encodeFlags(
        MessageType.REQ,
        CompressionCodecType.ZSTD,
        false,
        false,
      );

      expect(gzipFlags).toBe(1); // CodecIndex.GZIP
      expect(snappyFlags).toBe(2); // CodecIndex.SNAPPY
      expect(lz4Flags).toBe(3); // CodecIndex.LZ4
      expect(zstdFlags).toBe(4); // CodecIndex.ZSTD
    });

    it('should handle string codec type', () => {
      const flags = handler.encodeFlags(
        MessageType.REQ,
        'gzip' as any,
        false,
        false,
      );

      expect(flags).toBe(1);
    });
  });

  describe('decodeFlags', () => {
    it('should decode flags correctly', () => {
      const flags = 26; // REQ, snappy, compressed, chunked
      const decoded = handler.decodeFlags(flags);

      expect(decoded).toBeDefined();
      expect(decoded!.type).toBe(MessageType.REQ);
      expect(decoded!.codec).toBe(CompressionCodecType.SNAPPY);
      expect(decoded!.isCompressed).toBe(true);
      expect(decoded!.isChunked).toBe(true);
    });

    it('should decode ACK message', () => {
      const flags = 32; // ACK
      const decoded = handler.decodeFlags(flags);

      expect(decoded).toBeDefined();
      expect(decoded!.type).toBe(MessageType.ACK);
      expect(decoded!.codec).toBe(CompressionCodecType.NONE);
      expect(decoded!.isCompressed).toBe(false);
      expect(decoded!.isChunked).toBe(false);
    });

    it('should decode RES message', () => {
      const flags = 64; // RES
      const decoded = handler.decodeFlags(flags);

      expect(decoded).toBeDefined();
      expect(decoded!.type).toBe(MessageType.RES);
    });

    it('should return undefined for undefined flags', () => {
      const decoded = handler.decodeFlags(undefined);
      expect(decoded).toBeUndefined();
    });

    it('should decode various codec types', () => {
      const gzipFlags = handler.encodeFlags(
        MessageType.REQ,
        CompressionCodecType.GZIP,
        true,
        false,
      );
      const decoded = handler.decodeFlags(gzipFlags);

      expect(decoded!.codec).toBe(CompressionCodecType.GZIP);
      expect(decoded!.isCompressed).toBe(true);
    });
  });

  describe('encode/decode round-trip', () => {
    it('should encode and decode flags correctly', () => {
      const encoded = handler.encodeFlags(
        MessageType.REQ,
        CompressionCodecType.LZ4,
        true,
        true,
      );
      const decoded = handler.decodeFlags(encoded);

      expect(decoded!.type).toBe(MessageType.REQ);
      expect(decoded!.codec).toBe(CompressionCodecType.LZ4);
      expect(decoded!.isCompressed).toBe(true);
      expect(decoded!.isChunked).toBe(true);
    });

    it('should handle all message types in round-trip', () => {
      const types = [MessageType.REQ, MessageType.ACK, MessageType.RES];

      types.forEach(type => {
        const encoded = handler.encodeFlags(
          type,
          CompressionCodecType.NONE,
          false,
          false,
        );
        const decoded = handler.decodeFlags(encoded);
        expect(decoded!.type).toBe(type);
      });
    });
  });

  describe('isValidEnvelope', () => {
    it('should validate valid envelope', () => {
      const envelope = {
        id: 'test-123',
        body: { data: 'test' },
        flags: 0,
      };

      expect(handler.isValidEnvelope(envelope)).toBe(true);
    });

    it('should reject null', () => {
      expect(handler.isValidEnvelope(null)).toBe(false);
    });

    it('should reject non-object', () => {
      expect(handler.isValidEnvelope('string')).toBe(false);
      expect(handler.isValidEnvelope(123)).toBe(false);
    });

    it('should reject envelope without id', () => {
      const envelope = {
        body: { data: 'test' },
        flags: 0,
      };

      expect(handler.isValidEnvelope(envelope)).toBe(false);
    });

    it('should reject envelope without flags', () => {
      const envelope = {
        id: 'test-123',
        body: { data: 'test' },
      };

      expect(handler.isValidEnvelope(envelope)).toBe(false);
    });

    it('should reject envelope with non-string id', () => {
      const envelope = {
        id: 123,
        body: { data: 'test' },
        flags: 0,
      };

      expect(handler.isValidEnvelope(envelope)).toBe(false);
    });

    it('should reject envelope with non-number flags', () => {
      const envelope = {
        id: 'test-123',
        body: { data: 'test' },
        flags: 'invalid',
      };

      expect(handler.isValidEnvelope(envelope)).toBe(false);
    });
  });

  describe('parse', () => {
    it('should parse valid JSON envelope', () => {
      const jsonString = JSON.stringify({
        id: 'test-123',
        body: { data: 'test' },
        flags: 0,
      });

      const parsed = handler.parse(jsonString);
      expect(parsed).toBeDefined();
      expect(parsed!.id).toBe('test-123');
      expect(parsed!.body).toEqual({ data: 'test' });
      expect(parsed!.flags).toBe(0);
    });

    it('should return null for invalid JSON', () => {
      const parsed = handler.parse('invalid json {');
      expect(parsed).toBeNull();
    });

    it('should return null for non-envelope object', () => {
      const jsonString = JSON.stringify({ foo: 'bar' });
      const parsed = handler.parse(jsonString);
      expect(parsed).toBeNull();
    });

    it('should parse envelope with optional fields', () => {
      const jsonString = JSON.stringify({
        id: 'test-123',
        body: { data: 'test' },
        flags: 26,
        checksum: 'abc123',
        ci: 0,
        ct: 5,
        os: 1000,
        cs: 500,
      });

      const parsed = handler.parse(jsonString);
      expect(parsed).toBeDefined();
      expect(parsed!.checksum).toBe('abc123');
      expect(parsed!.ci).toBe(0);
      expect(parsed!.ct).toBe(5);
      expect(parsed!.os).toBe(1000);
      expect(parsed!.cs).toBe(500);
    });
  });

  describe('serialize', () => {
    it('should serialize envelope to JSON string', () => {
      const envelope = {
        id: 'test-123',
        body: { data: 'test' },
        flags: 0,
      };

      const serialized = handler.serialize(envelope);
      expect(typeof serialized).toBe('string');
      expect(JSON.parse(serialized)).toEqual(envelope);
    });

    it('should serialize envelope with all fields', () => {
      const envelope = {
        id: 'test-123',
        body: { data: 'test' },
        flags: 26,
        checksum: 'abc123',
        ci: 0,
        ct: 5,
        os: 1000,
        cs: 500,
      };

      const serialized = handler.serialize(envelope);
      expect(JSON.parse(serialized)).toEqual(envelope);
    });
  });

  describe('parse/serialize round-trip', () => {
    it('should maintain data integrity', () => {
      const original = {
        id: 'test-123',
        body: { data: 'test', nested: { value: 42 } },
        flags: 26,
        checksum: 'abc123',
      };

      const serialized = handler.serialize(original);
      const parsed = handler.parse(serialized);

      expect(parsed).toEqual(original);
    });
  });

  describe('createEnvelope', () => {
    it('should create basic envelope', () => {
      const envelope = handler.createEnvelope('test-123', MessageType.REQ, {
        data: 'test',
      });

      expect(envelope.id).toBe('test-123');
      expect(envelope.body).toEqual({ data: 'test' });
      expect(envelope.flags).toBe(0);
    });

    it('should create envelope with checksum', () => {
      const envelope = handler.createEnvelope(
        'test-123',
        MessageType.REQ,
        { data: 'test' },
        { checksum: 'abc123' },
      );

      expect(envelope.checksum).toBe('abc123');
    });

    it('should create envelope with compression info', () => {
      const envelope = handler.createEnvelope(
        'test-123',
        MessageType.REQ,
        { data: 'test' },
        {
          codec: CompressionCodecType.GZIP,
          isCompressed: true,
          originalSize: 1000,
          compressedSize: 500,
        },
      );

      const decoded = handler.decodeFlags(envelope.flags);
      expect(decoded!.codec).toBe(CompressionCodecType.GZIP);
      expect(decoded!.isCompressed).toBe(true);
      expect(envelope.os).toBe(1000);
      expect(envelope.cs).toBe(500);
    });

    it('should create envelope with chunk info', () => {
      const envelope = handler.createEnvelope(
        'test-123',
        MessageType.REQ,
        { data: 'test' },
        {
          isChunked: true,
          chunkIndex: 2,
          chunkTotal: 10,
        },
      );

      const decoded = handler.decodeFlags(envelope.flags);
      expect(decoded!.isChunked).toBe(true);
      expect(envelope.ci).toBe(2);
      expect(envelope.ct).toBe(10);
    });

    it('should create ACK envelope', () => {
      const envelope = handler.createEnvelope(
        'test-123',
        MessageType.ACK,
        null,
      );

      const decoded = handler.decodeFlags(envelope.flags);
      expect(decoded!.type).toBe(MessageType.ACK);
      expect(envelope.body).toBeNull();
    });

    it('should create RES envelope', () => {
      const envelope = handler.createEnvelope('test-123', MessageType.RES, {
        result: 'success',
      });

      const decoded = handler.decodeFlags(envelope.flags);
      expect(decoded!.type).toBe(MessageType.RES);
      expect(envelope.body).toEqual({ result: 'success' });
    });

    it('should not include compression sizes when not compressed', () => {
      const envelope = handler.createEnvelope(
        'test-123',
        MessageType.REQ,
        { data: 'test' },
        { isCompressed: false },
      );

      expect(envelope.os).toBeUndefined();
      expect(envelope.cs).toBeUndefined();
    });

    it('should not include chunk info when not chunked', () => {
      const envelope = handler.createEnvelope(
        'test-123',
        MessageType.REQ,
        { data: 'test' },
        { isChunked: false },
      );

      expect(envelope.ci).toBeUndefined();
      expect(envelope.ct).toBeUndefined();
    });
  });
});
