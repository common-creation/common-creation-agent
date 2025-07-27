/**
 * Schema Sanitizer
 * MCPツールのスキーマをVoltAgent互換形式にサニタイズするユーティリティ
 *
 * 外部MCPサーバーから返されるツールの inputSchema には、
 * VoltAgentのZod変換処理でエラーを引き起こすプロパティが含まれている場合があります。
 * このユーティリティは、すべてのMCPツールの inputSchema を削除することで、
 * VoltAgentが検証なしでツールを受け入れるようにします。
 */

import type { MCPTool } from './types.js'

/**
 * ツールのスキーマをサニタイズ
 *
 * VoltAgentの内部Zod変換処理をバイパスするため、すべてのMCPツールの
 * inputSchema を削除します。これにより、VoltAgentは検証なしでツールを受け入れます。
 *
 * @param tool - サニタイズ対象のMCPツール
 * @returns inputSchema が削除されたツール
 */
export function sanitizeToolSchema(tool: MCPTool): MCPTool {
  // inputSchema を削除してVoltAgentのZod変換をスキップ
  const sanitized = { ...tool }
  delete sanitized.inputSchema

  return sanitized
}

/**
 * ツール配列をサニタイズ
 *
 * すべてのツールの inputSchema を削除して、VoltAgentが検証なしでツールを
 * 受け入れるようにします。
 *
 * @param tools - サニタイズ対象のMCPツール配列
 * @returns inputSchema が削除されたツール配列
 */
export function sanitizeTools(tools: MCPTool[]): MCPTool[] {
  const sanitized: MCPTool[] = []
  let removedCount = 0

  for (const tool of tools) {
    const sanitizedTool = sanitizeToolSchema(tool)
    sanitized.push(sanitizedTool)

    // inputSchemaが削除された場合はカウント
    if (tool.inputSchema) {
      removedCount++
    }
  }

  if (removedCount > 0) {
    console.info(
      `Removed inputSchema from ${removedCount} MCP tool(s) to bypass VoltAgent Zod validation`
    )
  }

  return sanitized
}
