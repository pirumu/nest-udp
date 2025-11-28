import { Logger } from '@nestjs/common';
import {
  CompressionCodecType,
  CompressionFactory,
  GzipCodec,
  Lz4Codec,
  SnappyCodec,
  ZstdCodec,
} from '../../compression';
import {
  CompressionHandlerConfig,
  CompressionResult,
} from './reliable-udp-socket.types';
import {
  COMPRESSION_REDUCTION_MULTIPLIER,
  DEFAULT_COMPRESSION_CODEC,
  DEFAULT_COMPRESSION_LEVEL,
  DEFAULT_COMPRESSION_MIN_REDUCTION,
  DEFAULT_COMPRESSION_MIN_SIZE,
} from './reliable-udp-socket.constants';

export class CompressionHandler {
  private readonly _logger = new Logger(CompressionHandler.name);
  private readonly _config: CompressionHandlerConfig;
  private readonly _factory: CompressionFactory;

  constructor(config: CompressionHandlerConfig) {
    this._config = {
      enabled: config.enabled,
      codec: config.codec ?? DEFAULT_COMPRESSION_CODEC,
      level: config.level ?? DEFAULT_COMPRESSION_LEVEL,
      minSize: config.minSize ?? DEFAULT_COMPRESSION_MIN_SIZE,
      minReduction: config.minReduction ?? DEFAULT_COMPRESSION_MIN_REDUCTION,
    };
    this._factory = new CompressionFactory();
    this._registerCodecs();
  }

  private _registerCodecs(): void {
    this._factory.register(new GzipCodec(this._config.level));
    this._factory.register(new SnappyCodec());
    this._factory.register(new Lz4Codec());
    this._factory.register(new ZstdCodec(this._config.level));

    const available = this._factory.availableCodecs();
    this._logger.log(
      `Available codecs: ${available.map(c => String(c)).join(', ')}`,
    );
  }

  public shouldCompress(size: number): boolean {
    return this._config.enabled && size >= this._config.minSize;
  }

  public async tryCompress(
    jsonString: string,
  ): Promise<CompressionResult | null> {
    if (!this._config.enabled) {
      return null;
    }

    const originalSize = Buffer.byteLength(jsonString, 'utf8');

    if (originalSize < this._config.minSize) {
      return null;
    }

    const codec = this._factory.get(this._config.codec);

    if (!codec) {
      this._logger.warn(`Codec ${String(this._config.codec)} not available`);
      return null;
    }

    try {
      const buffer = Buffer.from(jsonString, 'utf8');
      const compressed = await codec.compress(buffer);
      const compressedSize = compressed.length;

      // Calculate reduction percentage
      const reduction =
        (1 - compressedSize / originalSize) * COMPRESSION_REDUCTION_MULTIPLIER;

      if (reduction >= this._config.minReduction) {
        return {
          data: compressed.toString('base64'),
          codec: codec.name,
          originalSize,
          compressedSize,
        };
      }

      this._logger.debug(
        `Compression ${String(codec.name)} reduction ${reduction.toFixed(1)}% < ${this._config.minReduction}%, using uncompressed`,
      );

      return null;
    } catch (error: any) {
      this._logger.error(`Compression failed: ${error.message}`);
      return null;
    }
  }

  public async tryDecompress(
    data: string,
    codecName: CompressionCodecType,
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  ): Promise<any | null> {
    const codec = this._factory.get(codecName);

    if (!codec) {
      this._logger.error(`Unknown codec: ${String(codecName)}`);
      return null;
    }

    try {
      const compressedBuffer = Buffer.from(data, 'base64');
      const decompressed = await codec.decompress(compressedBuffer);
      return JSON.parse(decompressed.toString('utf8'));
    } catch (error: any) {
      this._logger.error(
        `Decompression failed with ${String(codecName)}: ${error.message}`,
      );
      return null;
    }
  }
}
