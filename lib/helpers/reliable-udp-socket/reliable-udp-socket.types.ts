import { CompressionCodecType } from '../../compression';

/**
 * Message Type as 2-bit values (supports 4 types)
 * Encoded in bits 5-6 of flags byte
 */
export enum MessageType {
  REQ = 0b00, // 0
  ACK = 0b01, // 1
  RES = 0b10, // 2
}

/**
 * Codec index for bit-packing (3 bits supports 8 codecs)
 * Encoded in bits 0-2 of flags byte
 */
export enum CodecIndex {
  NONE = 0,
  GZIP = 1,
  SNAPPY = 2,
  LZ4 = 3,
  ZSTD = 4,
}

/**
 * Bit layout in flags byte (single byte = all metadata):
 *
 * ┌─────────┬──────────┬─────────┬───────┬────────┬──────┬──────┬──────┐
 * │  Bit 7  │  Bit 6   │  Bit 5  │ Bit 4 │ Bit 3  │ Bit 2│ Bit 1│ Bit 0│
 * │Reserved │  Type[1] │ Type[0] │Chunked│Compress│Codec2│Codec1│Codec0│
 * └─────────┴──────────┴─────────┴───────┴────────┴──────┴──────┴──────┘
 *
 * Examples:
 * - REQ, gzip compressed, not chunked:    0b00001001 = 9
 * - ACK, no compression, not chunked:     0b00100000 = 32
 * - REQ, snappy compressed, chunked:      0b00011010 = 26
 */
export enum FlagBits {
  CODEC_MASK = 0b00000111, // Bits 0-2: Codec
  COMPRESSED = 0b00001000, // Bit 3: Compression flag
  CHUNKED = 0b00010000, // Bit 4: Chunking flag
  TYPE_MASK = 0b01100000, // Bits 5-6: Message type
  TYPE_SHIFT = 5, // Shift to extract type bits
}

export type ReliableUdpSocketOptions = {
  maxMessageSize?: number;
  chunkSize?: number;
  maxRetries?: number;
  retryInterval?: number;
  enableChecksum?: boolean;
  requestTimeout?: number;
  reassemblyTimeout?: number;
  compression?: CompressionConfig;
  messageIdOptions?: {
    workerId?: number;
    epoch?: bigint;
  };
};

export type CompressionConfig = {
  /** Enable compression */
  enabled: boolean;
  /** Codec: gzip (built-in), snappy, lz4, zstd (require npm install) */
  codec: CompressionCodecType;
  /** Compression level (codec-specific, default: 6 for gzip/zstd) */
  level: number;
  /** Minimum size to compress (bytes, default: 256) */
  minSize: number;
  /** Minimum reduction % to use compression (default: 10) */
  minReduction: number;
};

export type SocketConfig = {
  maxMessageSize: number;
  maxRetries: number;
  retryInterval: number;
  enableChecksum: boolean;
};

export type CompressionHandlerConfig = {
  enabled: boolean;
  codec: CompressionCodecType;
  level: number;
  minSize: number;
  minReduction: number;
};

export type ChunkingHandlerConfig = {
  chunkSize: number;
  reassemblyTimeout: number;
};

export type RequestTrackerConfig = {
  requestTimeout: number;
};

export type SnowflakeConfig = {
  workerId: number;
  epoch: bigint;
};

/**
 * Message envelope structure
 *
 * Compact format with all metadata in single flags byte:
 * - Bits 0-2: Codec (0=none, 1=gzip, 2=snappy, 3=lz4, 4=zstd, 5=brotli)
 * - Bit 3:    Compression enabled (0=off, 1=on)
 * - Bit 4:    Chunked message (0=single, 1=multipart)
 * - Bits 5-6: Message type (0=REQ, 1=ACK, 2=RES, 3=reserved)
 * - Bit 7:    Reserved for future use
 *
 */
export type MessageEnvelope = {
  id: string;
  body: any;
  checksum?: string;

  /** Bit-packed metadata flags (single byte) - includes type, codec, compression, chunking */
  flags?: number;

  /** Message type (only for backward compatibility, encoded in flags in new format) */
  type?: MessageType;

  /** Chunk index (only present if flags bit 4 = 1) */
  ci?: number;

  /** Chunk total (only present if flags bit 4 = 1) */
  ct?: number;

  /** Original size before compression (only present if flags bit 3 = 1) */
  os?: number;

  /** Compressed size (only present if flags bit 3 = 1) */
  cs?: number;
};

export type CompressionResult = {
  data: string;
  codec: CompressionCodecType;
  originalSize: number;
  compressedSize: number;
};

export type ResponseHandler = {
  timeoutId?: NodeJS.Timeout;
  callback: (response: any) => void;
  ackReceived: boolean;
  retryCount: number;
  retryTimer?: NodeJS.Timeout;
  timestamp: number;
};

export type ChunkedMessageAssembly = {
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  chunks: (any | null)[];
  totalChunks: number;
  receivedCount: number;
  acksReceived: Set<number>;
  timestamp: number;
  remoteInfo?: any;
  compressionCodec?: CompressionCodecType;
};

export type DecodedFlags = {
  type: MessageType;
  codec: CompressionCodecType;
  isCompressed: boolean;
  isChunked: boolean;
};

export type MessageEnvelopOptions = {
  checksum?: string;
  codec?: CompressionCodecType;
  isCompressed?: boolean;
  isChunked?: boolean;
  chunkIndex?: number;
  chunkTotal?: number;
  originalSize?: number;
  compressedSize?: number;
};
