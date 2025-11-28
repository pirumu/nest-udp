import { Logger } from '@nestjs/common';
import {
  RequestTrackerConfig,
  ResponseHandler,
} from './reliable-udp-socket.types';
import { DEFAULT_REQUEST_TIMEOUT } from './reliable-udp-socket.constants';

export class RequestTracker {
  private readonly _logger = new Logger(RequestTracker.name);
  private readonly _config: RequestTrackerConfig;
  private readonly _handlers = new Map<string, ResponseHandler>();

  constructor(config: RequestTrackerConfig) {
    this._config = {
      requestTimeout: config.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT,
    };
  }

  public register(
    messageId: string,
    callback: (response: any) => void,
    onTimeout?: (messageId: string) => void,
  ): void {
    const handler: ResponseHandler = {
      callback,
      ackReceived: false,
      retryCount: 0,
      timestamp: Date.now(),
    };

    this._handlers.set(messageId, handler);

    handler.timeoutId = setTimeout(() => {
      if (this._handlers.has(messageId)) {
        this.remove(messageId);

        this._logger.warn(
          `Request ${messageId} timed out after ${this._config.requestTimeout}ms`,
        );

        if (onTimeout) {
          onTimeout(messageId);
        }
      }
    }, this._config.requestTimeout);
  }

  public setRetryTimer(messageId: string, timer: NodeJS.Timeout): boolean {
    const handler = this._handlers.get(messageId);

    if (!handler) {
      return false;
    }

    if (handler.retryTimer) {
      clearTimeout(handler.retryTimer);
    }

    handler.retryTimer = timer;
    return true;
  }

  public clearRetryTimer(messageId: string): void {
    const handler = this._handlers.get(messageId);

    if (handler?.retryTimer) {
      clearTimeout(handler.retryTimer);
      handler.retryTimer = undefined;
    }
  }

  public incrementRetry(messageId: string): number {
    const handler = this._handlers.get(messageId);

    if (!handler) {
      return 0;
    }

    handler.retryCount++;
    return handler.retryCount;
  }

  public invokeAndRemove(messageId: string, response: any): boolean {
    const handler = this._handlers.get(messageId);

    if (!handler) {
      return false;
    }

    this.clearRetryTimer(messageId);
    if ((handler as any).timeoutId) {
      clearTimeout((handler as any).timeoutId);
    }

    try {
      handler.callback(response);
    } catch (error: any) {
      this._logger.error(`Callback error for ${messageId}: ${error.message}`);
    }

    this._handlers.delete(messageId);

    return true;
  }

  public get(messageId: string): ResponseHandler | undefined {
    return this._handlers.get(messageId);
  }

  public remove(messageId: string): boolean {
    const handler = this._handlers.get(messageId);

    if (!handler) {
      return false;
    }

    // Clear all timers
    this.clearRetryTimer(messageId);
    if ((handler as any).timeoutId) {
      clearTimeout((handler as any).timeoutId);
    }

    this._handlers.delete(messageId);
    return true;
  }

  public cleanupOldRequests(maxAge: number): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [messageId, handler] of this._handlers.entries()) {
      if (now - handler.timestamp > maxAge) {
        this.remove(messageId);
        cleanedCount++;

        this._logger.warn(
          `Cleaned old request ${messageId} (age: ${now - handler.timestamp}ms)`,
        );
      }
    }

    return cleanedCount;
  }

  public clear(): void {
    // Clean up all timers
    for (const messageId of this._handlers.keys()) {
      this.remove(messageId);
    }
  }
}
