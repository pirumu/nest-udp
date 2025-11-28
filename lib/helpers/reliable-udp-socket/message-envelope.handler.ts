import { CompressionCodecType } from '../../compression';
import {
  MessageEnvelope,
  MessageType,
  CodecIndex,
  FlagBits,
  DecodedFlags,
  MessageEnvelopOptions,
} from './reliable-udp-socket.types';

export const CODEC_TO_INDEX: Record<string, CodecIndex> = {
  none: CodecIndex.NONE,
  gzip: CodecIndex.GZIP,
  snappy: CodecIndex.SNAPPY,
  lz4: CodecIndex.LZ4,
  zstd: CodecIndex.ZSTD,
} as const;

export const INDEX_TO_CODEC: CompressionCodecType[] = [
  CompressionCodecType.NONE,
  CompressionCodecType.GZIP,
  CompressionCodecType.SNAPPY,
  CompressionCodecType.LZ4,
  CompressionCodecType.ZSTD,
] as const;

export class MessageEnvelopeHandler {
  /**
   * Encode flags byte from components
   * Bit 0-2: codec (0=none, 1=gzip, 2=snappy, 3=lz4, 4=zstd, 5=brotli)
   * Bit 3:   compression enabled
   * Bit 4:   chunked
   * Bit 5-6: message type (0=REQ, 1=ACK, 2=RES, 3=reserved)
   * Bit 7:   reserved
   */
  public encodeFlags(
    type: MessageType,
    codec: CompressionCodecType | 'none',
    isCompressed: boolean,
    isChunked: boolean,
  ): number {
    let flags = 0;

    // Set codec bits (0-2)
    // Handle both numeric enum values and string values
    const codecIndex =
      typeof codec === 'number'
        ? codec
        : CODEC_TO_INDEX[codec] || CodecIndex.NONE;
    flags |= codecIndex;

    // Set compression bit (3)
    if (isCompressed) {
      flags |= FlagBits.COMPRESSED;
    }

    // Set chunked bit (4)
    if (isChunked) {
      flags |= FlagBits.CHUNKED;
    }

    // Set message type bits (5-6)
    flags |= type << FlagBits.TYPE_SHIFT;

    return flags;
  }

  public decodeFlags(flags?: number): DecodedFlags | undefined {
    if (flags === undefined) {
      return undefined;
    }

    const codecIndex = flags & FlagBits.CODEC_MASK;
    const codec = INDEX_TO_CODEC[codecIndex] || CompressionCodecType.NONE;
    const isCompressed = (flags & FlagBits.COMPRESSED) !== 0;
    const isChunked = (flags & FlagBits.CHUNKED) !== 0;
    const type = (flags & FlagBits.TYPE_MASK) >> FlagBits.TYPE_SHIFT;

    return { type, codec, isCompressed, isChunked };
  }

  public isValidEnvelope(obj: any): obj is MessageEnvelope {
    if (typeof obj !== 'object' || obj === null || typeof obj.id !== 'string') {
      return false;
    }
    return typeof obj.flags === 'number';
  }

  public parse(jsonString: string): MessageEnvelope | null {
    try {
      const parsed = JSON.parse(jsonString);
      if (!this.isValidEnvelope(parsed)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  public serialize(envelope: MessageEnvelope): string {
    return JSON.stringify(envelope);
  }

  public createEnvelope(
    id: string,
    type: MessageType,
    body: any,
    options: MessageEnvelopOptions = {},
  ): MessageEnvelope {
    const {
      checksum,
      codec = CompressionCodecType.NONE,
      isCompressed = false,
      isChunked = false,
      chunkIndex,
      chunkTotal,
      originalSize,
      compressedSize,
    } = options;

    const envelope: MessageEnvelope = {
      id,
      body,
      flags: this.encodeFlags(type, codec, isCompressed, isChunked),
    };

    if (checksum) {
      envelope.checksum = checksum;
    }

    if (isCompressed) {
      envelope.os = originalSize;
      envelope.cs = compressedSize;
    }

    if (isChunked && chunkIndex !== undefined && chunkTotal !== undefined) {
      envelope.ci = chunkIndex;
      envelope.ct = chunkTotal;
    }

    return envelope;
  }
}
