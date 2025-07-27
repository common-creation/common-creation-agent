/**
 * Core Types Test
 * コア型定義のテスト
 */

import { describe, expect, it } from 'vitest'
import type { AgentConfig, ConversationContext, Message } from './types.js'

describe('Core Types', () => {
  it('should create valid AgentConfig', () => {
    const config: AgentConfig = {
      llm: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: 'test-key',
      },
      logging: {
        level: 'info',
        format: 'json',
      },
    }

    expect(config.llm.provider).toBe('openai')
    expect(config.llm.model).toBe('gpt-4o-mini')
    expect(config.logging.level).toBe('info')
  })

  it('should create valid ConversationContext', () => {
    const context: ConversationContext = {
      sessionId: 'test-session',
      userId: 'test-user',
      history: [],
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    expect(context.sessionId).toBe('test-session')
    expect(context.userId).toBe('test-user')
    expect(Array.isArray(context.history)).toBe(true)
  })

  it('should create valid Message', () => {
    const message: Message = {
      id: 'msg-1',
      role: 'user',
      content: 'Hello, world!',
      timestamp: new Date(),
    }

    expect(message.id).toBe('msg-1')
    expect(message.role).toBe('user')
    expect(message.content).toBe('Hello, world!')
  })
})
