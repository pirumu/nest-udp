import { Logger } from '@nestjs/common';
import * as dgram from 'node:dgram';
import * as crypto from 'crypto';
import { UdpSocket } from '../udp-socket';
import { CompressionCodecType } from '../../compression';
import {
  CompressionResult,
  MessageEnvelope,
  MessageType,
  ReliableUdpSocketOptions,
  SocketConfig,
} from './reliable-udp-socket.types';
import { SnowflakeIdGenerator } from './snowflake-id.generator';
import { MessageEnvelopeHandler } from './message-envelope.handler';
import { CompressionHandler } from './compression.handler';
import { ChunkingHandler } from './chunking.handler';
import { RequestTracker } from './request-tracker';
import {
  DEFAULT_MAX_MESSAGE_SIZE,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_INTERVAL,
  DEFAULT_ENABLE_CHECKSUM,
  DEFAULT_RECEIVE_BUFFER_SIZE,
  DEFAULT_SEND_BUFFER_SIZE,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_REASSEMBLY_TIMEOUT,
  DEFAULT_REQUEST_TIMEOUT,
  DEFAULT_COMPRESSION_CODEC,
  DEFAULT_COMPRESSION_LEVEL,
  DEFAULT_COMPRESSION_MIN_SIZE,
  DEFAULT_COMPRESSION_MIN_REDUCTION,
  SNOWFLAKE_DEFAULT_EPOCH,
  MIN_MESSAGE_SIZE,
  MAX_MESSAGE_SIZE,
  BYTES_TO_MB,
  REQUEST_CLEANUP_AGE,
  CLEANUP_INTERVAL,
} from './reliable-udp-socket.constants';

/**
 * Reliable UDP Socket
 *
 * A production-ready UDP socket with:
 * - REQ/ACK/RES pattern for reliability
 * - Automatic chunking for large messages
 * - Multi-codec compression (gzip, snappy, lz4, zstd)
 * - Snowflake IDs for distributed systems
 * - Bit-packed metadata for minimal overhead
 *
 */
export class ReliableUdpSocket extends UdpSocket {
  private readonly _logger = new Logger(ReliableUdpSocket.name);
  private _config: SocketConfig;

  // Handlers (Dependency Injection via Composition)
  private _idGenerator: SnowflakeIdGenerator;
  private readonly _envelopeHandler: MessageEnvelopeHandler;
  private _compressionHandler: CompressionHandler;
  private _chunkingHandler: ChunkingHandler;
  private _requestTracker: RequestTracker;

  // Cleanup
  private _cleanupTimer: NodeJS.Timeout | null = null;

  constructor(socket: dgram.Socket) {
    super(socket);

    // Initialize with defaults
    this._config = {
      maxMessageSize: DEFAULT_MAX_MESSAGE_SIZE,
      maxRetries: DEFAULT_MAX_RETRIES,
      retryInterval: DEFAULT_RETRY_INTERVAL,
      enableChecksum: DEFAULT_ENABLE_CHECKSUM,
    };

    // Initialize handlers with defaults
    this._idGenerator = new SnowflakeIdGenerator({
      workerId: 0,
      epoch: SNOWFLAKE_DEFAULT_EPOCH,
    });
    this._envelopeHandler = new MessageEnvelopeHandler();

    this._compressionHandler = new CompressionHandler({
      enabled: false,
      codec: DEFAULT_COMPRESSION_CODEC,
      level: DEFAULT_COMPRESSION_LEVEL,
      minSize: DEFAULT_COMPRESSION_MIN_SIZE,
      minReduction: DEFAULT_COMPRESSION_MIN_REDUCTION,
    });

    this._chunkingHandler = new ChunkingHandler({
      chunkSize: DEFAULT_CHUNK_SIZE,
      reassemblyTimeout: DEFAULT_REASSEMBLY_TIMEOUT,
    });

    this._requestTracker = new RequestTracker({
      requestTimeout: DEFAULT_REQUEST_TIMEOUT,
    });

    // Start background cleanup
    this._startCleanupTimer();
    this.socket.on('close', () => this._stopCleanupTimer());
  }

  /**
   * Configure the socket with options
   */
  public configure(options: ReliableUdpSocketOptions = {}): this {
    // Update configuration
    this._config = {
      maxMessageSize: options.maxMessageSize ?? this._config.maxMessageSize,
      maxRetries: options.maxRetries ?? this._config.maxRetries,
      retryInterval: options.retryInterval ?? this._config.retryInterval,
      enableChecksum: options.enableChecksum ?? this._config.enableChecksum,
    };

    // Validate configuration
    this._validateOptions();

    // Re-initialize handlers if options provided
    if (options.messageIdOptions) {
      this._idGenerator = new SnowflakeIdGenerator({
        workerId: options.messageIdOptions.workerId ?? 0,
        epoch: options.messageIdOptions.epoch ?? SNOWFLAKE_DEFAULT_EPOCH,
      });
    }

    if (options.compression !== undefined) {
      this._compressionHandler = new CompressionHandler({
        enabled: options.compression.enabled ?? false,
        codec: options.compression.codec ?? DEFAULT_COMPRESSION_CODEC,
        level: options.compression.level ?? DEFAULT_COMPRESSION_LEVEL,
        minSize: options.compression.minSize ?? DEFAULT_COMPRESSION_MIN_SIZE,
        minReduction:
          options.compression.minReduction ?? DEFAULT_COMPRESSION_MIN_REDUCTION,
      });
    }

    if (
      options.chunkSize !== undefined ||
      options.reassemblyTimeout !== undefined
    ) {
      this._chunkingHandler = new ChunkingHandler({
        chunkSize: options.chunkSize ?? DEFAULT_CHUNK_SIZE,
        reassemblyTimeout:
          options.reassemblyTimeout ?? DEFAULT_REASSEMBLY_TIMEOUT,
      });
    }

    if (options.requestTimeout !== undefined) {
      this._requestTracker = new RequestTracker({
        requestTimeout: options.requestTimeout,
      });
    }

    return this;
  }

  /**
   * Validate options
   */
  private _validateOptions(): void {
    if (
      this._config.maxMessageSize < MIN_MESSAGE_SIZE ||
      this._config.maxMessageSize > MAX_MESSAGE_SIZE
    ) {
      throw new Error(`Invalid maxMessageSize: ${this._config.maxMessageSize}`);
    }
  }

  /**
   * Send message (override from UdpSocket)
   */
  protected handleSend(
    message: any,
    host?: string,
    port?: number,
    callback?: (err?: any) => void,
  ): void {
    this._sendMessageAsync(message, host!, port!, callback).catch(error => {
      if (callback) callback(error);
    });
  }

  /**
   * Send message with compression and chunking
   */
  private async _sendMessageAsync(
    message: any,
    host: string,
    port: number,
    callback?: (err?: any) => void,
  ): Promise<void> {
    try {
      const jsonString = JSON.stringify(message);
      const originalSize = Buffer.byteLength(jsonString, 'utf8');

      // Try compression
      let bodyToSend: any = message;
      let compressionResult: CompressionResult | null = null;

      if (this._compressionHandler.shouldCompress(originalSize)) {
        compressionResult =
          await this._compressionHandler.tryCompress(jsonString);

        if (compressionResult) {
          bodyToSend = compressionResult.data;
        }
      }

      // Calculate final size
      const finalString =
        typeof bodyToSend === 'string'
          ? bodyToSend
          : JSON.stringify(bodyToSend);

      const finalSize = Buffer.byteLength(finalString, 'utf8');

      // Decide: chunk or send directly
      if (finalSize <= this._config.maxMessageSize) {
        this._sendSingleMessage(
          bodyToSend,
          host,
          port,
          callback,
          compressionResult,
        );
      } else {
        this._sendChunkedMessage(
          bodyToSend,
          host,
          port,
          callback,
          compressionResult,
        );
      }
    } catch (error: any) {
      if (callback) callback(error);
    }
  }

  /**
   * Send single (non-chunked) message
   */
  private _sendSingleMessage(
    body: any,
    host: string,
    port: number,
    callback?: (err?: any) => void,
    compressionResult?: CompressionResult | null,
  ): void {
    const messageId = this._idGenerator.generate();
    const codec = compressionResult?.codec || CompressionCodecType.NONE;
    const isCompressed = compressionResult !== null;

    const envelope = this._envelopeHandler.createEnvelope(
      messageId,
      MessageType.REQ,
      body,
      {
        checksum: this._config.enableChecksum
          ? this._calculateChecksum(body)
          : undefined,
        codec,
        isCompressed,
        originalSize: compressionResult?.originalSize,
        compressedSize: compressionResult?.compressedSize,
      },
    );

    // Register request handler
    this._requestTracker.register(
      messageId,
      () => {
        if (callback) {
          callback(null);
        }
      },
      () => {
        if (callback) {
          callback(new Error(`Timeout for ${messageId}`));
        }
      },
    );

    // Send request
    this._sendRequestWithRetry(envelope, host, port);
  }

  /**
   * Send chunked message
   */
  private _sendChunkedMessage(
    body: any,
    host: string,
    port: number,
    callback?: (err?: any) => void,
    compressionResult?: CompressionResult | null,
  ): void {
    const messageId = this._idGenerator.generate();
    const dataString = typeof body === 'string' ? body : JSON.stringify(body);
    const chunks = this._chunkingHandler.createChunks(dataString);

    this._logger.log(
      `Chunking message ${messageId} into ${chunks.length} chunks`,
    );

    let completedChunks = 0;
    let hasError = false;

    const codec = compressionResult?.codec || CompressionCodecType.NONE;
    const isCompressed = compressionResult !== null;

    for (let i = 0; i < chunks.length; i++) {
      const chunkId = `${messageId}-chunk-${i}`;

      const envelope = this._envelopeHandler.createEnvelope(
        chunkId,
        MessageType.REQ,
        chunks[i],
        {
          checksum: this._config.enableChecksum
            ? this._calculateChecksum(chunks[i])
            : undefined,
          codec,
          isCompressed: isCompressed && i === 0, // Only mark first chunk as compressed
          isChunked: true,
          chunkIndex: i,
          chunkTotal: chunks.length,
          originalSize: i === 0 ? compressionResult?.originalSize : undefined,
          compressedSize:
            i === 0 ? compressionResult?.compressedSize : undefined,
        },
      );

      this._requestTracker.register(
        chunkId,
        () => {
          completedChunks++;
          if (completedChunks === chunks.length) {
            if (callback && !hasError) {
              callback(null);
            }
          }
        },
        () => {
          if (!hasError) {
            hasError = true;
            if (callback) {
              callback(new Error(`Chunk ${i} timeout`));
            }
          }
        },
      );

      this._sendRequestWithRetry(envelope, host, port);
    }
  }

  private _sendRequestWithRetry(
    envelope: MessageEnvelope,
    host: string,
    port: number,
  ): void {
    const serialized = this._envelopeHandler.serialize(envelope);

    const chunkInfo =
      envelope.ci !== undefined ? ` chunk ${envelope.ci}/${envelope.ct}` : '';
    this._logger.debug(`→ REQ ${envelope.id}${chunkInfo}`);
    this.socket.send(serialized, port, host, err => {
      if (err) {
        this._logger.error(`Send failed ${envelope.id}: ${err.message}`);
        return;
      }
      // Setup retry logic
      const handler = this._requestTracker.get(envelope.id);
      if (
        !handler ||
        handler.ackReceived ||
        handler.retryCount >= this._config.maxRetries
      ) {
        return;
      }

      const retryTimer = setTimeout(() => {
        const currentHandler = this._requestTracker.get(envelope.id);
        if (
          !currentHandler ||
          currentHandler.ackReceived ||
          currentHandler.retryCount >= this._config.maxRetries
        ) {
          return;
        }

        const newRetryCount = this._requestTracker.incrementRetry(envelope.id);

        this._logger.warn(
          `↻ Retry ${envelope.id} (${newRetryCount}/${this._config.maxRetries})`,
        );

        const retryEnvelope = { ...envelope, retryCount: newRetryCount };
        this._sendRequestWithRetry(retryEnvelope, host, port);
      }, this._config.retryInterval);

      this._requestTracker.setRetryTimer(envelope.id, retryTimer);
    });
  }

  protected handleData(data: Buffer, rinfo: dgram.RemoteInfo): void {
    this._processIncomingMessage(data, rinfo).catch(error => {
      this._logger.error(`Error processing message: ${error.message}`);
    });
  }

  private async _processIncomingMessage(
    data: Buffer,
    rinfo: dgram.RemoteInfo,
  ): Promise<void> {
    const dataString = data.toString();

    const envelope = this._envelopeHandler.parse(dataString);

    if (!envelope) {
      this.emitMessage(dataString, rinfo);
      return;
    }

    const flags = this._envelopeHandler.decodeFlags(envelope.flags);
    const messageType = flags?.type ?? envelope.type;

    switch (messageType) {
      case MessageType.REQ:
        await this._handleRequest(envelope, rinfo);
        break;
      case MessageType.ACK:
        this._handleAcknowledgement(envelope);
        break;
      case MessageType.RES:
        this._handleResponse(envelope, rinfo);
        break;
      default:
        this.emitMessage(dataString, rinfo);
    }
  }

  private async _handleRequest(
    req: MessageEnvelope,
    rinfo: dgram.RemoteInfo,
  ): Promise<void> {
    if (this._config.enableChecksum && req.checksum) {
      const calculated = this._calculateChecksum(req.body);
      if (calculated !== req.checksum) {
        this._logger.error(`Checksum failure for ${req.id}`);
        return;
      }
    }

    this._sendAcknowledgement(req.id, rinfo);

    if (req.ci !== undefined && req.ct !== undefined) {
      await this._handleChunkedRequest(req, rinfo);
    } else {
      await this._handleSingleRequest(req, rinfo);
    }
  }

  private async _handleSingleRequest(
    req: MessageEnvelope,
    rinfo: dgram.RemoteInfo,
  ): Promise<void> {
    let finalBody = req.body;
    const flags = this._envelopeHandler.decodeFlags(req.flags);
    if (flags && flags.codec !== CompressionCodecType.NONE) {
      finalBody = await this._compressionHandler.tryDecompress(
        req.body,
        flags.codec,
      );
    }
    const messageString = JSON.stringify(finalBody);
    this.emitMessage(messageString, rinfo);
  }

  private async _handleChunkedRequest(
    req: MessageEnvelope,
    rinfo: dgram.RemoteInfo,
  ): Promise<void> {
    const baseId = req.id.split('-chunk-')[0];
    const flags = this._envelopeHandler.decodeFlags(req.flags);
    if (!this._chunkingHandler.getAssembly(baseId)) {
      this._chunkingHandler.initAssembly(baseId, req.ct!, rinfo, flags?.codec);
    }
    const isComplete = this._chunkingHandler.addChunk(
      baseId,
      req.ci!,
      req.body,
    );

    if (isComplete) {
      const assembled = this._chunkingHandler.getAssembledData(baseId);

      if (!assembled) {
        this._logger.error(`Failed to assemble message ${baseId}`);
        return;
      }

      this._chunkingHandler.removeAssembly(baseId);

      let finalData = assembled.data.toString('utf8');

      if (assembled.compressionCodec) {
        const decompressed = await this._compressionHandler.tryDecompress(
          finalData,
          assembled.compressionCodec,
        );
        finalData = JSON.stringify(decompressed);
      }

      this.emitMessage(finalData, rinfo);
    }
  }

  private _sendAcknowledgement(id: string, rinfo: dgram.RemoteInfo): void {
    const ackEnvelope = this._envelopeHandler.createEnvelope(
      id,
      MessageType.ACK,
      null,
    );

    const serialized = this._envelopeHandler.serialize(ackEnvelope);

    this._logger.debug(`← ACK ${id}`);

    this.socket.send(serialized, rinfo.port, rinfo.address);
  }

  private _handleAcknowledgement(ack: MessageEnvelope): void {
    if (this._requestTracker.invokeAndRemove(ack.id, null)) {
      this._logger.debug(`✓ ACK ${ack.id}`);
    }
  }

  private _handleResponse(
    res: MessageEnvelope,
    _rinfo: dgram.RemoteInfo,
  ): void {
    if (this._config.enableChecksum && res.checksum) {
      const calculated = this._calculateChecksum(res.body);
      if (calculated !== res.checksum) {
        this._logger.error(`Checksum failure for RES ${res.id}`);
        return;
      }
    }
    this._requestTracker.invokeAndRemove(res.id, res.body);
  }

  private _calculateChecksum(data: any): string {
    const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
    return crypto.createHash('sha256').update(jsonString).digest('hex');
  }

  private _startCleanupTimer(): void {
    this._cleanupTimer = setInterval(() => {
      this._chunkingHandler.cleanupStaleAssemblies();
      this._requestTracker.cleanupOldRequests(REQUEST_CLEANUP_AGE);
    }, CLEANUP_INTERVAL);
  }

  private _stopCleanupTimer(): void {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }

  public close() {
    this._stopCleanupTimer();
    this._requestTracker.clear();
    this._chunkingHandler.clear();
    super.close();
    return this;
  }
}
