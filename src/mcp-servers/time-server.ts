#!/usr/bin/env node
/**
 * Simple Time MCP Server
 * Node.js implementation of a time MCP server for testing
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

// ツールスキーマの定義
const GetCurrentTimeSchema = z.object({
  timezone: z.string().optional().describe('Timezone (e.g., "Asia/Tokyo", "America/New_York")'),
  format: z.string().optional().describe('Time format (e.g., "ISO", "locale", "unix")'),
})

// MCPサーバーインスタンスを作成
const server = new Server(
  {
    name: 'time-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

// ツール一覧を返すハンドラー
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_current_time',
        description: 'Get the current date and time in specified timezone',
        inputSchema: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description: 'Timezone (e.g., "Asia/Tokyo", "America/New_York")',
            },
            format: {
              type: 'string',
              description: 'Time format: "ISO", "locale", "unix"',
              enum: ['ISO', 'locale', 'unix'],
            },
          },
        },
      },
    ],
  }
})

// ツール実行ハンドラー
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== 'get_current_time') {
    throw new Error(`Unknown tool: ${request.params.name}`)
  }

  const args = GetCurrentTimeSchema.parse(request.params.arguments || {})
  const now = new Date()

  let result: string
  const timezone = args.timezone || 'UTC'
  const format = args.format || 'ISO'

  try {
    switch (format) {
      case 'unix':
        result = Math.floor(now.getTime() / 1000).toString()
        break
      case 'locale':
        result = now.toLocaleString('ja-JP', { timeZone: timezone })
        break
      case 'ISO':
      default:
        // タイムゾーンを考慮したISO文字列を生成
        result = now.toLocaleString('en-US', {
          timeZone: timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).replace(/(\d+)\/(\d+)\/(\d+),?\s*(\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6')
        break
    }

    return {
      content: [
        {
          type: 'text',
          text: `Current time (${timezone}, ${format}): ${result}`,
        },
      ],
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error getting time: ${error.message}`,
        },
      ],
      isError: true,
    }
  }
})

// サーバーを起動
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Time MCP Server started on stdio')
}

main().catch((error) => {
  console.error('Server error:', error)
  process.exit(1)
})