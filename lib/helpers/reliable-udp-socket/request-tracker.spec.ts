import { RequestTracker } from './request-tracker';

describe('RequestTracker', () => {
  let tracker: RequestTracker;

  beforeEach(() => {
    tracker = new RequestTracker({
      requestTimeout: 1000,
    });
  });

  afterEach(() => {
    tracker.clear();
  });

  describe('register', () => {
    it('should register request handler', () => {
      const callback = jest.fn();
      tracker.register('msg-123', callback);

      const handler = tracker.get('msg-123');
      expect(handler).toBeDefined();
      expect(handler!.callback).toBe(callback);
      expect(handler!.ackReceived).toBe(false);
      expect(handler!.retryCount).toBe(0);
    });

    it('should set timestamp', () => {
      const before = Date.now();
      tracker.register('msg-123', jest.fn());
      const after = Date.now();

      const handler = tracker.get('msg-123');
      expect(handler!.timestamp).toBeGreaterThanOrEqual(before);
      expect(handler!.timestamp).toBeLessThanOrEqual(after);
    });

    it('should call onTimeout after timeout period', async () => {
      const callback = jest.fn();
      const onTimeout = jest.fn();

      const shortTracker = new RequestTracker({
        requestTimeout: 100,
      });

      shortTracker.register('msg-123', callback, onTimeout);

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(onTimeout).toHaveBeenCalledWith('msg-123');
      expect(shortTracker.get('msg-123')).toBeUndefined();

      shortTracker.clear();
    });

    it('should not call onTimeout if request completes', async () => {
      const callback = jest.fn();
      const onTimeout = jest.fn();

      tracker.register('msg-123', callback, onTimeout);

      // Complete request before timeout
      tracker.invokeAndRemove('msg-123', 'response');

      // Wait to ensure timeout doesn't fire
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('should allow registering multiple requests', () => {
      tracker.register('msg-1', jest.fn());
      tracker.register('msg-2', jest.fn());
      tracker.register('msg-3', jest.fn());

      expect(tracker.get('msg-1')).toBeDefined();
      expect(tracker.get('msg-2')).toBeDefined();
      expect(tracker.get('msg-3')).toBeDefined();
    });
  });

  describe('get', () => {
    it('should return registered handler', () => {
      const callback = jest.fn();
      tracker.register('msg-123', callback);

      const handler = tracker.get('msg-123');
      expect(handler).toBeDefined();
      expect(handler!.callback).toBe(callback);
    });

    it('should return undefined for non-existent request', () => {
      const handler = tracker.get('non-existent');
      expect(handler).toBeUndefined();
    });
  });

  describe('invokeAndRemove', () => {
    it('should invoke callback with response', () => {
      const callback = jest.fn();
      tracker.register('msg-123', callback);

      const result = tracker.invokeAndRemove('msg-123', { data: 'response' });

      expect(result).toBe(true);
      expect(callback).toHaveBeenCalledWith({ data: 'response' });
    });

    it('should remove handler after invocation', () => {
      const callback = jest.fn();
      tracker.register('msg-123', callback);

      tracker.invokeAndRemove('msg-123', 'response');

      expect(tracker.get('msg-123')).toBeUndefined();
    });

    it('should return false for non-existent request', () => {
      const result = tracker.invokeAndRemove('non-existent', 'response');
      expect(result).toBe(false);
    });

    it('should clear timeout timer', async () => {
      const callback = jest.fn();
      const onTimeout = jest.fn();

      const shortTracker = new RequestTracker({
        requestTimeout: 100,
      });

      shortTracker.register('msg-123', callback, onTimeout);
      shortTracker.invokeAndRemove('msg-123', 'response');

      // Wait to ensure timeout doesn't fire
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(onTimeout).not.toHaveBeenCalled();

      shortTracker.clear();
    });

    it('should clear retry timer', () => {
      const callback = jest.fn();
      tracker.register('msg-123', callback);

      const retryTimer = setTimeout(() => {}, 5000);
      tracker.setRetryTimer('msg-123', retryTimer);

      tracker.invokeAndRemove('msg-123', 'response');

      // Handler should be removed, so retry timer is cleared
      expect(tracker.get('msg-123')).toBeUndefined();
    });

    it('should handle callback errors gracefully', () => {
      const callback = jest.fn(() => {
        throw new Error('Callback error');
      });

      tracker.register('msg-123', callback);

      // Should not throw
      expect(() => {
        tracker.invokeAndRemove('msg-123', 'response');
      }).not.toThrow();

      expect(callback).toHaveBeenCalledWith('response');
      expect(tracker.get('msg-123')).toBeUndefined();
    });
  });

  describe('remove', () => {
    it('should remove handler', () => {
      tracker.register('msg-123', jest.fn());
      expect(tracker.get('msg-123')).toBeDefined();

      const removed = tracker.remove('msg-123');
      expect(removed).toBe(true);
      expect(tracker.get('msg-123')).toBeUndefined();
    });

    it('should return false for non-existent request', () => {
      const removed = tracker.remove('non-existent');
      expect(removed).toBe(false);
    });

    it('should clear all timers', async () => {
      const onTimeout = jest.fn();

      const shortTracker = new RequestTracker({
        requestTimeout: 100,
      });

      shortTracker.register('msg-123', jest.fn(), onTimeout);

      const retryTimer = setTimeout(() => {}, 5000);
      shortTracker.setRetryTimer('msg-123', retryTimer);

      shortTracker.remove('msg-123');

      // Wait to ensure timeout doesn't fire
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(onTimeout).not.toHaveBeenCalled();

      shortTracker.clear();
    });
  });

  describe('setRetryTimer', () => {
    it('should set retry timer', () => {
      tracker.register('msg-123', jest.fn());

      const timer = setTimeout(() => {}, 1000);
      const result = tracker.setRetryTimer('msg-123', timer);

      expect(result).toBe(true);

      const handler = tracker.get('msg-123');
      expect(handler!.retryTimer).toBe(timer);

      clearTimeout(timer);
    });

    it('should return false for non-existent request', () => {
      const timer = setTimeout(() => {}, 1000);
      const result = tracker.setRetryTimer('non-existent', timer);

      expect(result).toBe(false);
      clearTimeout(timer);
    });

    it('should clear previous retry timer', () => {
      tracker.register('msg-123', jest.fn());

      const timer1 = setTimeout(() => {}, 1000);
      tracker.setRetryTimer('msg-123', timer1);

      const timer2 = setTimeout(() => {}, 1000);
      tracker.setRetryTimer('msg-123', timer2);

      const handler = tracker.get('msg-123');
      expect(handler!.retryTimer).toBe(timer2);

      clearTimeout(timer2);
    });
  });

  describe('clearRetryTimer', () => {
    it('should clear retry timer', () => {
      tracker.register('msg-123', jest.fn());

      const timer = setTimeout(() => {}, 1000);
      tracker.setRetryTimer('msg-123', timer);

      tracker.clearRetryTimer('msg-123');

      const handler = tracker.get('msg-123');
      expect(handler!.retryTimer).toBeUndefined();
    });

    it('should not throw for non-existent request', () => {
      expect(() => {
        tracker.clearRetryTimer('non-existent');
      }).not.toThrow();
    });

    it('should not throw when retry timer is not set', () => {
      tracker.register('msg-123', jest.fn());

      expect(() => {
        tracker.clearRetryTimer('msg-123');
      }).not.toThrow();
    });
  });

  describe('incrementRetry', () => {
    it('should increment retry count', () => {
      tracker.register('msg-123', jest.fn());

      const count1 = tracker.incrementRetry('msg-123');
      expect(count1).toBe(1);

      const count2 = tracker.incrementRetry('msg-123');
      expect(count2).toBe(2);

      const count3 = tracker.incrementRetry('msg-123');
      expect(count3).toBe(3);
    });

    it('should return 0 for non-existent request', () => {
      const count = tracker.incrementRetry('non-existent');
      expect(count).toBe(0);
    });

    it('should persist retry count in handler', () => {
      tracker.register('msg-123', jest.fn());

      tracker.incrementRetry('msg-123');
      tracker.incrementRetry('msg-123');

      const handler = tracker.get('msg-123');
      expect(handler!.retryCount).toBe(2);
    });
  });

  describe('cleanupOldRequests', () => {
    it('should remove old requests', async () => {
      tracker.register('msg-old', jest.fn());

      // Wait to make request old
      await new Promise(resolve => setTimeout(resolve, 150));

      tracker.register('msg-fresh', jest.fn());

      const cleanedCount = tracker.cleanupOldRequests(100); // 100ms max age

      expect(cleanedCount).toBe(1);
      expect(tracker.get('msg-old')).toBeUndefined();
      expect(tracker.get('msg-fresh')).toBeDefined();
    });

    it('should return 0 when no old requests', () => {
      tracker.register('msg-1', jest.fn());
      tracker.register('msg-2', jest.fn());

      const cleanedCount = tracker.cleanupOldRequests(10000);

      expect(cleanedCount).toBe(0);
      expect(tracker.get('msg-1')).toBeDefined();
      expect(tracker.get('msg-2')).toBeDefined();
    });

    it('should clean multiple old requests', async () => {
      tracker.register('msg-old-1', jest.fn());
      tracker.register('msg-old-2', jest.fn());
      tracker.register('msg-old-3', jest.fn());

      await new Promise(resolve => setTimeout(resolve, 150));

      const cleanedCount = tracker.cleanupOldRequests(100);

      expect(cleanedCount).toBe(3);
      expect(tracker.get('msg-old-1')).toBeUndefined();
      expect(tracker.get('msg-old-2')).toBeUndefined();
      expect(tracker.get('msg-old-3')).toBeUndefined();
    });

    it('should clear timers for cleaned requests', async () => {
      const onTimeout = jest.fn();

      tracker.register('msg-old', jest.fn(), onTimeout);

      await new Promise(resolve => setTimeout(resolve, 150));

      tracker.cleanupOldRequests(100);

      // Wait to ensure timeout doesn't fire after cleanup
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Timeout should not fire because request was cleaned up
      expect(onTimeout).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should clear all requests', () => {
      tracker.register('msg-1', jest.fn());
      tracker.register('msg-2', jest.fn());
      tracker.register('msg-3', jest.fn());

      tracker.clear();

      expect(tracker.get('msg-1')).toBeUndefined();
      expect(tracker.get('msg-2')).toBeUndefined();
      expect(tracker.get('msg-3')).toBeUndefined();
    });

    it('should clear all timers', async () => {
      const onTimeout1 = jest.fn();
      const onTimeout2 = jest.fn();

      const shortTracker = new RequestTracker({
        requestTimeout: 100,
      });

      shortTracker.register('msg-1', jest.fn(), onTimeout1);
      shortTracker.register('msg-2', jest.fn(), onTimeout2);

      shortTracker.clear();

      // Wait to ensure timeouts don't fire
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(onTimeout1).not.toHaveBeenCalled();
      expect(onTimeout2).not.toHaveBeenCalled();
    });

    it('should allow new registrations after clear', () => {
      tracker.register('msg-1', jest.fn());
      tracker.clear();

      tracker.register('msg-new', jest.fn());
      expect(tracker.get('msg-new')).toBeDefined();
    });
  });

  describe('ackReceived flag', () => {
    it('should start with ackReceived false', () => {
      tracker.register('msg-123', jest.fn());

      const handler = tracker.get('msg-123');
      expect(handler!.ackReceived).toBe(false);
    });

    it('should allow setting ackReceived manually', () => {
      tracker.register('msg-123', jest.fn());

      const handler = tracker.get('msg-123');
      handler!.ackReceived = true;

      expect(tracker.get('msg-123')!.ackReceived).toBe(true);
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple concurrent requests', () => {
      const callbacks: Array<jest.Mock> = [];

      // Register 100 concurrent requests
      for (let i = 0; i < 100; i++) {
        const callback = jest.fn();
        callbacks.push(callback);
        tracker.register(`msg-${i}`, callback);
      }

      // Invoke half of them
      for (let i = 0; i < 50; i++) {
        tracker.invokeAndRemove(`msg-${i}`, `response-${i}`);
      }

      // Verify invoked callbacks were called
      for (let i = 0; i < 50; i++) {
        expect(callbacks[i]).toHaveBeenCalledWith(`response-${i}`);
        expect(tracker.get(`msg-${i}`)).toBeUndefined();
      }

      // Verify remaining requests still exist
      for (let i = 50; i < 100; i++) {
        expect(tracker.get(`msg-${i}`)).toBeDefined();
      }
    });
  });
});
