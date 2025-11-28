import {
  SNOWFLAKE_MAX_WORKER_ID,
  SNOWFLAKE_MAX_SEQUENCE,
  SNOWFLAKE_WORKER_ID_SHIFT,
  SNOWFLAKE_TIMESTAMP_SHIFT,
  SNOWFLAKE_DEFAULT_EPOCH,
} from './reliable-udp-socket.constants';
import { SnowflakeConfig } from './reliable-udp-socket.types';

/**
 * Snowflake ID Generator
 *
 * Generates unique 64-bit distributed IDs inspired by Twitter's Snowflake:
 * - 41 bits: timestamp (milliseconds since custom epoch)
 * - 10 bits: worker/machine ID (0-1023)
 * - 12 bits: sequence number (0-4095)
 */

export class SnowflakeIdGenerator {
  private readonly _config: SnowflakeConfig;
  private _sequence = 0n;
  private _lastTimestamp = -1n;

  constructor(config: SnowflakeConfig) {
    if (
      config.workerId < 0 ||
      config.workerId > Number(SNOWFLAKE_MAX_WORKER_ID)
    ) {
      throw new Error(
        `Worker ID must be between 0 and ${SNOWFLAKE_MAX_WORKER_ID}`,
      );
    }

    this._config = {
      workerId: config.workerId,
      epoch: config.epoch ?? SNOWFLAKE_DEFAULT_EPOCH,
    };
  }

  public generate(): string {
    let timestamp = BigInt(Date.now());

    if (timestamp === this._lastTimestamp) {
      // Same millisecond - increment sequence
      this._sequence = (this._sequence + 1n) & SNOWFLAKE_MAX_SEQUENCE;

      if (this._sequence === 0n) {
        // Sequence exhausted - wait for next millisecond
        timestamp = this._waitNextMillis(this._lastTimestamp);
      }
    } else {
      // New millisecond - reset sequence
      this._sequence = 0n;
    }

    if (timestamp < this._lastTimestamp) {
      throw new Error('Clock moved backwards. Refusing to generate ID.');
    }

    this._lastTimestamp = timestamp;

    // Compose the ID: [timestamp(41)] [workerId(10)] [sequence(12)]
    const workerId = BigInt(this._config.workerId);
    const id =
      ((timestamp - this._config.epoch) << SNOWFLAKE_TIMESTAMP_SHIFT) |
      (workerId << SNOWFLAKE_WORKER_ID_SHIFT) |
      this._sequence;

    return id.toString();
  }

  private _waitNextMillis(lastTimestamp: bigint): bigint {
    let timestamp = BigInt(Date.now());
    while (timestamp <= lastTimestamp) {
      timestamp = BigInt(Date.now());
    }
    return timestamp;
  }

  public parse(id: string): {
    timestamp: number;
    workerId: number;
    sequence: number;
  } {
    const snowflakeId = BigInt(id);

    const sequence = Number(snowflakeId & SNOWFLAKE_MAX_SEQUENCE);
    const workerId = Number(
      (snowflakeId >> SNOWFLAKE_WORKER_ID_SHIFT) & SNOWFLAKE_MAX_WORKER_ID,
    );
    const timestamp = Number(
      (snowflakeId >> SNOWFLAKE_TIMESTAMP_SHIFT) + this._config.epoch,
    );

    return { timestamp, workerId, sequence };
  }
}
