import { Logger } from '@nestjs/common';
import { CompressionCodec, CompressionCodecType } from './codec.interface';

export class CompressionFactory {
  private readonly _logger = new Logger(CompressionFactory.name);
  private readonly _codecs = new Map<CompressionCodecType, CompressionCodec>();

  public register(codec: CompressionCodec): void {
    if (codec.isAvailable()) {
      this._codecs.set(codec.name, codec);
      this._logger.log(`Registered codec: ${codec.name}`);
    } else {
      this._logger.warn(
        `Codec ${codec.name} not available (missing dependency?)`,
      );
    }
  }

  public get(name: CompressionCodecType): CompressionCodec | undefined {
    return this._codecs.get(name);
  }

  public all(): CompressionCodec[] {
    return Array.from(this._codecs.values());
  }

  public availableCodecs(): CompressionCodecType[] {
    return Array.from(this._codecs.keys());
  }
}
