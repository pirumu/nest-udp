import * as zlib from 'zlib';
import { promisify } from 'util';
import { CompressionCodec, CompressionCodecType } from '../codec.interface';

const gzipAsync = promisify(zlib.gzip);
const gunzipAsync = promisify(zlib.gunzip);

export class GzipCodec implements CompressionCodec {
  readonly name = CompressionCodecType.GZIP;

  constructor(private readonly level: number = 6) {
    if (level < 1 || level > 9) {
      throw new Error(`Invalid gzip level: ${level} (must be 1-9)`);
    }
  }

  public async compress(buffer: Buffer): Promise<Buffer> {
    return gzipAsync(buffer, { level: this.level });
  }

  public async decompress(buffer: Buffer): Promise<Buffer> {
    return gunzipAsync(buffer);
  }

  public isAvailable(): boolean {
    return true;
  }
}
