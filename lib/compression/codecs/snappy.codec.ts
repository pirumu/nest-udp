import { CompressionCodec, CompressionCodecType } from '../codec.interface';
import { CodecNotAvailableException } from '../../errors';

let snappy: any;
try {
  snappy = require('snappy');
} catch (e) {
  snappy = null;
}

export class SnappyCodec implements CompressionCodec {
  readonly name = CompressionCodecType.SNAPPY;

  public async compress(buffer: Buffer): Promise<Buffer> {
    if (!this.isAvailable()) {
      throw new CodecNotAvailableException(this.name.toString());
    }
    return snappy.compress(buffer);
  }

  public async decompress(buffer: Buffer): Promise<Buffer> {
    if (!this.isAvailable()) {
      throw new CodecNotAvailableException(this.name.toString());
    }
    return snappy.uncompress(buffer, { asBuffer: true });
  }

  public isAvailable(): boolean {
    return snappy !== null;
  }
}
