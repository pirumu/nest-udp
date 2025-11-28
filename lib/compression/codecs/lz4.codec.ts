import { CompressionCodec, CompressionCodecType } from '../codec.interface';
import { CodecNotAvailableException } from '../../errors';

let lz4: any;
try {
  lz4 = require('lz4');
} catch (e) {
  lz4 = null;
}

export class Lz4Codec implements CompressionCodec {
  readonly name = CompressionCodecType.LZ4;

  public async compress(buffer: Buffer): Promise<Buffer> {
    if (!this.isAvailable()) {
      throw new CodecNotAvailableException(this.name.toString());
    }

    // lz4 requires max output size calculation
    const maxSize = lz4.encodeBound(buffer.length);
    const output = Buffer.allocUnsafe(maxSize);
    const compressedSize = lz4.encodeBlock(buffer, output);

    return output.subarray(0, compressedSize);
  }

  public async decompress(buffer: Buffer): Promise<Buffer> {
    if (!this.isAvailable()) {
      throw new CodecNotAvailableException(this.name.toString());
    }

    // For decompression, we need to know the uncompressed size
    // We'll use a large buffer and slice it
    const maxSize = buffer.length * 10; // Assume max 10x expansion
    const output = Buffer.allocUnsafe(maxSize);
    const uncompressedSize = lz4.decodeBlock(buffer, output);

    return output.subarray(0, uncompressedSize);
  }

  public isAvailable(): boolean {
    return lz4 !== null;
  }
}
