import { CompressionCodec, CompressionCodecType } from '../codec.interface';
import { CodecNotAvailableException } from '../../errors';

let zstd: any;
try {
  zstd = require('@mongodb-js/zstd');
} catch (e) {
  zstd = null;
}

export class ZstdCodec implements CompressionCodec {
  readonly name = CompressionCodecType.ZSTD;

  constructor(private readonly level: number = 3) {
    if (level < 1 || level > 22) {
      throw new Error(`Invalid zstd level: ${level} (must be 1-22)`);
    }
  }

  public async compress(buffer: Buffer): Promise<Buffer> {
    if (!this.isAvailable()) {
      throw new CodecNotAvailableException(this.name.toString());
    }
    return zstd.compress(buffer, this.level);
  }

  public async decompress(buffer: Buffer): Promise<Buffer> {
    if (!this.isAvailable()) {
      throw new CodecNotAvailableException(this.name.toString());
    }
    return zstd.decompress(buffer);
  }

  public isAvailable(): boolean {
    return zstd !== null;
  }
}
