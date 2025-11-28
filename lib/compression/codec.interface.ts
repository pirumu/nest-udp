export enum CompressionCodecType {
  NONE,
  GZIP,
  SNAPPY,
  LZ4,
  ZSTD,
}

export interface CompressionCodec {
  readonly name: CompressionCodecType;
  compress(buffer: Buffer): Promise<Buffer>;
  decompress(buffer: Buffer): Promise<Buffer>;
  isAvailable(): boolean;
}
