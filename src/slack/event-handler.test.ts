import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import { SlackEventHandlerImpl } from './event-handler.js'
import type { SlackFileShareEvent, MessageFormatter as IMessageFormatter, SlackService as ISlackService, VoltAgentClient as IVoltAgentClient } from './types.js'

// Minimal fakes for dependencies
interface FakeAgentApiResponse { response: { content: string } }
const fakeFormatter: IMessageFormatter = {
  extractMentionText: (text: string) => text,
  formatAgentResponse: (resp: FakeAgentApiResponse) => resp.response.content,
  formatErrorMessage: (err: Error | string) => String(err),
  splitLongMessage: (m: string) => [m],
}

const fakeSlackService: ISlackService = {
  sendMessage: vi.fn(async () => {}),
  sendErrorMessage: vi.fn(async () => {}),
  addReaction: vi.fn(async () => {}),
  removeReaction: vi.fn(async () => {}),
  downloadFileAsBase64: vi.fn(async () => ''),
  start: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
}

const fakeVoltClient: IVoltAgentClient = {
  sendMessage: vi.fn(async (message: string, conversationId: string) => ({
    response: { content: `ACK:${message}` },
    sessionId: conversationId,
  })),
  sendMultiModalMessage: vi.fn(async (content: { type: string }[], conversationId: string) => ({
    response: { content: `MM:${content.length}` },
    sessionId: conversationId,
  })),
}

describe('SlackEventHandler conversationId mapping', () => {
  it('uses thread_ts as conversationId when present (mention)', async () => {
    const handler = new SlackEventHandlerImpl(
      fakeVoltClient,
      fakeFormatter,
      fakeSlackService,
      undefined
    )
    handler.setBotUserId('BOT')
    const event = { text: 'hello', channel: 'C1', thread_ts: '123.456', ts: '999.000' }
    await handler.handleMention(event, { userId: 'U1', channelId: 'C1', threadTs: '123.456', ts: '999.000' })
    expect(fakeVoltClient.sendMessage).toHaveBeenCalled()
  const sendMessageMock = fakeVoltClient.sendMessage as Mock
  const args = sendMessageMock.mock.calls[0]
  expect(args[1]).toBe('C1:123.456') // conversationId should equal channel:thread_ts
  })

  it('falls back to ts when thread_ts absent (mention)', async () => {
  (fakeVoltClient.sendMessage as Mock).mockClear()
    const handler = new SlackEventHandlerImpl(
      fakeVoltClient,
      fakeFormatter,
      fakeSlackService,
      undefined
    )
    handler.setBotUserId('BOT')
    const event = { text: 'hello', channel: 'C1', ts: '999.000' }
    await handler.handleMention(event, { userId: 'U1', channelId: 'C1', ts: '999.000' })
  const sendMessageMock2 = fakeVoltClient.sendMessage as Mock
  const args = sendMessageMock2.mock.calls[0]
  expect(args[1]).toBe('C1:999.000')
  })

  it('uses thread_ts for file share multimodal', async () => {
  (fakeVoltClient.sendMultiModalMessage as Mock).mockClear()
    const handler = new SlackEventHandlerImpl(
      fakeVoltClient,
      fakeFormatter,
      fakeSlackService,
      undefined
    )
    const event: SlackFileShareEvent = {
      type: 'event',
      subtype: 'file_share',
      files: [{ mimetype: 'image/png', size: 10, id: 'F1', name: 'a.png', filetype: 'png', url_private: 'https://example/image' }],
      channel: 'C1',
      user: 'U1',
      thread_ts: '321.111',
      ts: '222.000',
      text: 'see image',
    }
    await handler.handleFileShare(event, { userId: 'U1', channelId: 'C1', threadTs: '321.111', ts: '222.000' })
  const mmMock = fakeVoltClient.sendMultiModalMessage as Mock
  const args = mmMock.mock.calls[0]
  expect(args[1]).toBe('C1:321.111')
  })
})
