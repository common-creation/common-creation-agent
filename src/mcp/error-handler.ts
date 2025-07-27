import type { MCPError } from './types.js'

export class MCPErrorHandler {
  private static readonly MAX_RETRY_ATTEMPTS = 3
  private static readonly BASE_RETRY_DELAY = 1000
  private static readonly MAX_RETRY_DELAY = 30000

  static async handleWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    options: {
      maxAttempts?: number
      baseDelay?: number
      onRetry?: (attempt: number, error: Error) => void
    } = {}
  ): Promise<T> {
    const maxAttempts = options.maxAttempts || MCPErrorHandler.MAX_RETRY_ATTEMPTS
    const baseDelay = options.baseDelay || MCPErrorHandler.BASE_RETRY_DELAY

    let lastError: Error | undefined

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation()
      } catch (error: any) {
        lastError = error

        if (!MCPErrorHandler.isRetryable(error) || attempt === maxAttempts) {
          throw error
        }

        const delay = Math.min(baseDelay * 2 ** (attempt - 1), MCPErrorHandler.MAX_RETRY_DELAY)

        console.warn(
          `Operation ${operationName} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms:`,
          error.message
        )

        if (options.onRetry) {
          options.onRetry(attempt, error)
        }

        await MCPErrorHandler.delay(delay)
      }
    }

    throw lastError || new Error(`Operation ${operationName} failed after ${maxAttempts} attempts`)
  }

  static isRetryable(error: Error): boolean {
    if ((error as MCPError).retryable !== undefined) {
      return (error as MCPError).retryable === true
    }

    const retryableMessages = [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'ENETUNREACH',
      'EHOSTUNREACH',
      'EPIPE',
      'timeout',
      'connection',
    ]

    return retryableMessages.some(
      (msg) =>
        error.message.toLowerCase().includes(msg.toLowerCase()) ||
        (error as any).code?.includes(msg)
    )
  }

  static formatError(error: Error, context?: Record<string, any>): string {
    const mcpError = error as MCPError

    let message = `[MCP Error] ${error.message}`

    if (mcpError.type) {
      message += ` (Type: ${mcpError.type})`
    }

    if (mcpError.serverName) {
      message += ` (Server: ${mcpError.serverName})`
    }

    if (context) {
      message += ` Context: ${JSON.stringify(context)}`
    }

    return message
  }

  static createTimeoutError(operationName: string, timeout: number): MCPError {
    const error = new Error(`Operation ${operationName} timed out after ${timeout}ms`) as MCPError
    error.type = 'timeout'
    error.retryable = true
    return error
  }

  static wrapWithTimeout<T>(
    promise: Promise<T>,
    timeout: number,
    operationName: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(MCPErrorHandler.createTimeoutError(operationName, timeout))
        }, timeout)
      }),
    ])
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  static categorizeError(error: Error): MCPError['type'] {
    const message = error.message.toLowerCase()

    if (message.includes('connection') || message.includes('econnrefused')) {
      return 'connection'
    }

    if (message.includes('timeout') || message.includes('etimedout')) {
      return 'timeout'
    }

    if (message.includes('config') || message.includes('configuration')) {
      return 'configuration'
    }

    if (message.includes('protocol') || message.includes('invalid')) {
      return 'protocol'
    }

    return 'protocol'
  }
}
