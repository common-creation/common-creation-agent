import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MCPErrorHandler } from './error-handler.js'
import type { MCPError } from './types.js'

describe('MCPErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  describe('handleWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const operation = vi.fn().mockResolvedValue('success')

      const result = await MCPErrorHandler.handleWithRetry(operation, 'test-operation')

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledTimes(1)
    })

    it('should retry on retryable error', async () => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce('success')

      const promise = MCPErrorHandler.handleWithRetry(operation, 'test-operation', {
        baseDelay: 100,
      })

      // Fast-forward time for retry delay
      await vi.runAllTimersAsync()

      const result = await promise

      expect(result).toBe('success')
      expect(operation).toHaveBeenCalledTimes(2)
    })

    it('should not retry non-retryable errors', async () => {
      const error = new Error('Non-retryable error')
      const operation = vi.fn().mockRejectedValue(error)

      await expect(MCPErrorHandler.handleWithRetry(operation, 'test-operation')).rejects.toThrow(
        'Non-retryable error'
      )

      expect(operation).toHaveBeenCalledTimes(1)
    })

    it('should respect max attempts', async () => {
      const error = new Error('ECONNREFUSED')
      const operation = vi.fn().mockRejectedValue(error)

      const promise = MCPErrorHandler.handleWithRetry(operation, 'test-operation', {
        maxAttempts: 2,
        baseDelay: 100,
      })

      // Fast-forward through all retry delays
      await vi.runAllTimersAsync()

      await expect(promise).rejects.toThrow('ECONNREFUSED')
      expect(operation).toHaveBeenCalledTimes(2)
    })

    it('should call onRetry callback', async () => {
      const error = new Error('ECONNREFUSED')
      const operation = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('success')
      const onRetry = vi.fn()

      const promise = MCPErrorHandler.handleWithRetry(operation, 'test-operation', {
        baseDelay: 100,
        onRetry,
      })

      await vi.runAllTimersAsync()
      await promise

      expect(onRetry).toHaveBeenCalledWith(1, error)
    })
  })

  describe('isRetryable', () => {
    it('should recognize retryable MCP errors', () => {
      const error = new Error('Test error') as MCPError
      error.retryable = true

      expect(MCPErrorHandler.isRetryable(error)).toBe(true)
    })

    it('should recognize non-retryable MCP errors', () => {
      const error = new Error('Test error') as MCPError
      error.retryable = false

      expect(MCPErrorHandler.isRetryable(error)).toBe(false)
    })

    it('should recognize retryable error messages', () => {
      const retryableErrors = [
        'ECONNREFUSED',
        'ECONNRESET',
        'ETIMEDOUT',
        'ENOTFOUND',
        'ENETUNREACH',
        'EHOSTUNREACH',
        'EPIPE',
        'timeout',
        'connection error',
      ]

      retryableErrors.forEach((msg) => {
        expect(MCPErrorHandler.isRetryable(new Error(msg))).toBe(true)
      })
    })

    it('should recognize non-retryable error messages', () => {
      expect(MCPErrorHandler.isRetryable(new Error('Invalid configuration'))).toBe(false)
      expect(MCPErrorHandler.isRetryable(new Error('Unauthorized'))).toBe(false)
    })
  })

  describe('formatError', () => {
    it('should format basic error', () => {
      const error = new Error('Test error')
      const formatted = MCPErrorHandler.formatError(error)

      expect(formatted).toBe('[MCP Error] Test error')
    })

    it('should format MCP error with type', () => {
      const error = new Error('Test error') as MCPError
      error.type = 'connection'

      const formatted = MCPErrorHandler.formatError(error)

      expect(formatted).toBe('[MCP Error] Test error (Type: connection)')
    })

    it('should format MCP error with server name', () => {
      const error = new Error('Test error') as MCPError
      error.serverName = 'test-server'

      const formatted = MCPErrorHandler.formatError(error)

      expect(formatted).toBe('[MCP Error] Test error (Server: test-server)')
    })

    it('should format error with context', () => {
      const error = new Error('Test error')
      const context = { operation: 'connect', attempt: 1 }

      const formatted = MCPErrorHandler.formatError(error, context)

      expect(formatted).toBe('[MCP Error] Test error Context: {"operation":"connect","attempt":1}')
    })
  })

  describe('createTimeoutError', () => {
    it('should create timeout error', () => {
      const error = MCPErrorHandler.createTimeoutError('test-operation', 5000)

      expect(error.message).toBe('Operation test-operation timed out after 5000ms')
      expect(error.type).toBe('timeout')
      expect(error.retryable).toBe(true)
    })
  })

  describe('wrapWithTimeout', () => {
    it('should resolve when operation completes in time', async () => {
      const promise = Promise.resolve('success')

      const result = await MCPErrorHandler.wrapWithTimeout(promise, 1000, 'test-operation')

      expect(result).toBe('success')
    })

    it('should timeout when operation takes too long', async () => {
      const promise = new Promise((resolve) => {
        setTimeout(() => resolve('success'), 2000)
      })

      const timeoutPromise = MCPErrorHandler.wrapWithTimeout(promise, 100, 'test-operation')

      await vi.advanceTimersByTimeAsync(101)

      await expect(timeoutPromise).rejects.toThrow('Operation test-operation timed out after 100ms')
    })
  })

  describe('categorizeError', () => {
    it('should categorize connection errors', () => {
      expect(MCPErrorHandler.categorizeError(new Error('ECONNREFUSED'))).toBe('connection')
      expect(MCPErrorHandler.categorizeError(new Error('Connection failed'))).toBe('connection')
    })

    it('should categorize timeout errors', () => {
      expect(MCPErrorHandler.categorizeError(new Error('ETIMEDOUT'))).toBe('timeout')
      expect(MCPErrorHandler.categorizeError(new Error('Operation timeout'))).toBe('timeout')
    })

    it('should categorize protocol errors', () => {
      expect(MCPErrorHandler.categorizeError(new Error('Invalid protocol'))).toBe('protocol')
      expect(MCPErrorHandler.categorizeError(new Error('Protocol error'))).toBe('protocol')
    })

    it('should categorize configuration errors', () => {
      expect(MCPErrorHandler.categorizeError(new Error('Invalid configuration'))).toBe(
        'configuration'
      )
      expect(MCPErrorHandler.categorizeError(new Error('Configuration error'))).toBe(
        'configuration'
      )
    })

    it('should default to protocol for unknown errors', () => {
      expect(MCPErrorHandler.categorizeError(new Error('Unknown error'))).toBe('protocol')
    })
  })
})
