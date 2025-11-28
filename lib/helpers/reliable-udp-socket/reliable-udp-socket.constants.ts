import { CompressionCodecType } from '../../compression';

/** Default maximum UDP message size (bytes) */
export const DEFAULT_MAX_MESSAGE_SIZE = 1400;

/** Minimum allowed message size (bytes) */
export const MIN_MESSAGE_SIZE = 100;

/** Maximum allowed message size (bytes) - UDP limit */
export const MAX_MESSAGE_SIZE = 65000;

/** Default chunk size for large messages (bytes) */
export const DEFAULT_CHUNK_SIZE = 1200;

/** Default socket receive buffer size (bytes) - 4MB */
export const DEFAULT_RECEIVE_BUFFER_SIZE = 4194304;

/** Default socket send buffer size (bytes) - 4MB */
export const DEFAULT_SEND_BUFFER_SIZE = 4194304;

/** Default maximum retry attempts */
export const DEFAULT_MAX_RETRIES = 5;

/** Default retry interval (milliseconds) */
export const DEFAULT_RETRY_INTERVAL = 500;

/** Default request timeout (milliseconds) */
export const DEFAULT_REQUEST_TIMEOUT = 5000;

/** Default chunk reassembly timeout (milliseconds) - 30 seconds */
export const DEFAULT_REASSEMBLY_TIMEOUT = 30000;

/** Request cleanup age threshold (milliseconds) - 60 seconds */
export const REQUEST_CLEANUP_AGE = 60000;

/** Cleanup timer interval (milliseconds) - 10 seconds */
export const CLEANUP_INTERVAL = 10000;

/** Default checksum validation state */
export const DEFAULT_ENABLE_CHECKSUM = true;

/** Default compression codec */
export const DEFAULT_COMPRESSION_CODEC: CompressionCodecType =
  CompressionCodecType.NONE;

/** Default compression level (for gzip/zstd) */
export const DEFAULT_COMPRESSION_LEVEL = 6;

/** Default minimum size to compress (bytes) */
export const DEFAULT_COMPRESSION_MIN_SIZE = 256;

/** Default minimum reduction percentage to use compression */
export const DEFAULT_COMPRESSION_MIN_REDUCTION = 10;

/** Compression reduction percentage calculation multiplier */
export const COMPRESSION_REDUCTION_MULTIPLIER = 100;

/** Worker ID bit count */
export const SNOWFLAKE_WORKER_ID_BITS = 10n;

/** Sequence number bit count */
export const SNOWFLAKE_SEQUENCE_BITS = 12n;

/** Maximum worker ID value (2^10 - 1 = 1023) */
export const SNOWFLAKE_MAX_WORKER_ID = (1n << SNOWFLAKE_WORKER_ID_BITS) - 1n;

/** Maximum sequence value (2^12 - 1 = 4095) */
export const SNOWFLAKE_MAX_SEQUENCE = (1n << SNOWFLAKE_SEQUENCE_BITS) - 1n;

/** Worker ID bit shift position */
export const SNOWFLAKE_WORKER_ID_SHIFT = SNOWFLAKE_SEQUENCE_BITS;

/** Timestamp bit shift position */
export const SNOWFLAKE_TIMESTAMP_SHIFT =
  SNOWFLAKE_WORKER_ID_BITS + SNOWFLAKE_SEQUENCE_BITS;

/** Default epoch (2024-01-01 00:00:00 UTC) */
export const SNOWFLAKE_DEFAULT_EPOCH = 1704067200000n;

/** Bytes to megabytes conversion factor */
export const BYTES_TO_MB = 1024 * 1024;
