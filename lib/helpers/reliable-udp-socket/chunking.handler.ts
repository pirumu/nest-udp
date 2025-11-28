import { Logger } from '@nestjs/common';
import { CompressionCodecType } from '../../compression';
import {
  ChunkedMessageAssembly,
  ChunkingHandlerConfig,
} from './reliable-udp-socket.types';
import {
  DEFAULT_CHUNK_SIZE,
  DEFAULT_REASSEMBLY_TIMEOUT,
} from './reliable-udp-socket.constants';

export class ChunkingHandler {
  private readonly _logger = new Logger(ChunkingHandler.name);
  private readonly _config: ChunkingHandlerConfig;
  private readonly _assemblies = new Map<string, ChunkedMessageAssembly>();

  constructor(config: ChunkingHandlerConfig) {
    this._config = {
      chunkSize: config.chunkSize ?? DEFAULT_CHUNK_SIZE,
      reassemblyTimeout: config.reassemblyTimeout ?? DEFAULT_REASSEMBLY_TIMEOUT,
    };
  }

  public createChunks(data: string | Buffer): string[] {
    const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    const totalChunks = Math.ceil(buffer.length / this._config.chunkSize);
    const chunks: string[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * this._config.chunkSize;
      const end = Math.min(start + this._config.chunkSize, buffer.length);
      const chunkData = buffer.subarray(start, end).toString('base64');
      chunks.push(chunkData);
    }

    this._logger.log(`Split ${buffer.length} bytes into ${totalChunks} chunks`);

    return chunks;
  }

  public initAssembly(
    messageId: string,
    totalChunks: number,
    remoteInfo?: any,
    compressionCodec?: CompressionCodecType,
  ): void {
    this._assemblies.set(messageId, {
      chunks: new Array(totalChunks).fill(null),
      totalChunks,
      receivedCount: 0,
      acksReceived: new Set(),
      timestamp: Date.now(),
      remoteInfo,
      compressionCodec,
    });
  }

  public addChunk(
    messageId: string,
    chunkIndex: number,
    chunkData: any,
  ): boolean {
    const assembly = this._assemblies.get(messageId);

    if (!assembly) {
      this._logger.warn(`No assembly found for ${messageId}`);
      return false;
    }

    // Avoid duplicate chunks
    if (assembly.chunks[chunkIndex] === null) {
      assembly.chunks[chunkIndex] = chunkData;
      assembly.receivedCount++;

      this._logger.debug(
        `Chunk ${chunkIndex}/${assembly.totalChunks} received for ${messageId} (${assembly.receivedCount}/${assembly.totalChunks})`,
      );
    }

    return assembly.receivedCount === assembly.totalChunks;
  }

  public getAssembledData(
    messageId: string,
  ): { data: Buffer; compressionCodec?: CompressionCodecType } | null {
    const assembly = this._assemblies.get(messageId);

    if (!assembly || assembly.receivedCount !== assembly.totalChunks) {
      return null;
    }

    // Check for missing chunks
    if (assembly.chunks.some(chunk => chunk === null)) {
      this._logger.error(
        `Assembly ${messageId} incomplete with missing chunks`,
      );
      return null;
    }

    try {
      // Decode and concatenate all chunks
      const buffers = assembly.chunks.map(chunk =>
        Buffer.from(chunk as string, 'base64'),
      );
      const data = Buffer.concat(buffers);

      this._logger.log(
        `Reassembled ${messageId}: ${data.length} bytes from ${assembly.totalChunks} chunks`,
      );

      return {
        data,
        compressionCodec: assembly.compressionCodec,
      };
    } catch (error: any) {
      this._logger.error(
        `Reassembly failed for ${messageId}: ${error.message}`,
      );
      return null;
    }
  }

  public getAssembly(messageId: string): ChunkedMessageAssembly | undefined {
    return this._assemblies.get(messageId);
  }

  public removeAssembly(messageId: string): boolean {
    return this._assemblies.delete(messageId);
  }

  public cleanupStaleAssemblies(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [messageId, assembly] of this._assemblies.entries()) {
      if (now - assembly.timestamp > this._config.reassemblyTimeout) {
        this._assemblies.delete(messageId);
        cleanedCount++;

        this._logger.warn(
          `Cleaned stale assembly ${messageId} (${assembly.receivedCount}/${assembly.totalChunks} chunks)`,
        );
      }
    }

    return cleanedCount;
  }

  public clear(): void {
    this._assemblies.clear();
  }
}
