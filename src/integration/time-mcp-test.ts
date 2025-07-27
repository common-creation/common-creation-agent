/**
 * Time MCP Server Integration Test
 * time MCPサーバーを使った日時取得のテスト
 */

import { Agent } from '@voltagent/core'
import { openai } from '@ai-sdk/openai'
import { MCPManager } from '../mcp/index.js'
import { ConfigManager } from '../config/index.js'
import type { AgentConfig } from '../core/types.js'

/**
 * Time MCPサーバーのテストを実行
 */
async function testTimeMCPServer() {
  console.log('=== Time MCP Server Test ===\n')

  try {
    // 設定を読み込み
    console.log('1. Loading configuration...')
    const configManager = new ConfigManager()
    const config = await configManager.loadConfig() as AgentConfig

    // MCPマネージャーを初期化
    console.log('2. Initializing MCP Manager...')
    const mcpManager = new MCPManager()
    await mcpManager.initializeServers()

    // 利用可能なツールを取得
    const tools = await mcpManager.getAvailableTools()
    console.log(`   ✓ Loaded ${tools.length} MCP tools`)

    // time関連のツールを探す
    const timeTools = tools.filter(tool => 
      tool.name.toLowerCase().includes('time') || 
      tool.name.toLowerCase().includes('current')
    )
    
    if (timeTools.length > 0) {
      console.log('   Time-related tools found:')
      timeTools.forEach(tool => {
        console.log(`     - ${tool.name}: ${tool.description || 'No description'}`)
      })
    } else {
      console.log('   ⚠️  No time-related tools found')
    }

    // モデルを設定
    console.log('\n3. Setting up OpenAI model...')
    const model = openai(config.llm.model || 'gpt-4o-mini')

    // エージェントを作成
    console.log('\n4. Creating agent with MCP tools...')
    const agent = new Agent({
      id: 'time-test-agent',
      name: 'Time Test Agent',
      instructions: `あなたは日時を扱うテストエージェントです。
利用可能なツールを使って、正確な日時情報を提供してください。
必ずツールを使用して現在時刻を取得してください。`,
      model: model,
      tools: tools as any,
      markdown: true,
      maxSteps: 5,
    })

    // テストケース1: 現在時刻（UTC）
    console.log('\n5. Test Case 1: Current time in UTC')
    console.log('   Prompt: "What is the current UTC time?"')
    
    try {
      const result1 = await agent.generateText('What is the current UTC time? Use the time_get_current_time tool.', {
        temperature: 0.3,
      })

      console.log('   Response:', result1.text)
      if (result1.toolCalls && result1.toolCalls.length > 0) {
        console.log('   Tools used:')
        result1.toolCalls.forEach(call => {
          console.log(`     - ${call.toolName} with args:`, JSON.stringify((call as any).args || (call as any).parameters))
        })
      }
      if (result1.toolResults && result1.toolResults.length > 0) {
        console.log('   Tool results:')
        result1.toolResults.forEach((result: any) => {
          console.log(`     - ${JSON.stringify(result)}`)
        })
      }
    } catch (error: any) {
      console.error('   Error:', error.message)
    }

    // テストケース2: 東京時間
    console.log('\n6. Test Case 2: Current time in Tokyo')
    console.log('   Prompt: "今の東京の時刻を教えてください"')
    
    try {
      const result2 = await agent.generateText(
        '今の東京の時刻を教えてください。time_get_current_time ツールを使って、timezone を "Asia/Tokyo" に設定してください。',
        {
          temperature: 0.3,
        }
      )

      console.log('   Response:', result2.text)
      if (result2.toolCalls && result2.toolCalls.length > 0) {
        console.log('   Tools used:')
        result2.toolCalls.forEach(call => {
          console.log(`     - ${call.toolName} with args:`, JSON.stringify((call as any).args || (call as any).parameters))
        })
      }
    } catch (error: any) {
      console.error('   Error:', error.message)
    }

    // テストケース3: Unix timestamp
    console.log('\n7. Test Case 3: Unix timestamp')
    console.log('   Prompt: "Get the current Unix timestamp"')
    
    try {
      const result3 = await agent.generateText(
        'Get the current Unix timestamp. Use time_get_current_time with format set to "unix".',
        {
          temperature: 0.3,
        }
      )

      console.log('   Response:', result3.text)
      if (result3.toolCalls && result3.toolCalls.length > 0) {
        console.log('   Tools used:')
        result3.toolCalls.forEach(call => {
          console.log(`     - ${call.toolName} with args:`, JSON.stringify((call as any).args || (call as any).parameters))
        })
      }
    } catch (error: any) {
      console.error('   Error:', error.message)
    }

    // 直接ツールを呼び出すテスト
    console.log('\n8. Direct tool call test')
    console.log('   Calling time_get_current_time directly...')
    
    try {
      const directResult = await mcpManager.executeToolCall('time_get_current_time', {
        timezone: 'Asia/Tokyo',
        format: 'locale'
      })
      console.log('   Direct result:', JSON.stringify(directResult, null, 2))
    } catch (error: any) {
      console.error('   Direct call error:', error.message)
    }

    // MCPマネージャーを切断
    console.log('\n9. Disconnecting MCP Manager...')
    await mcpManager.disconnect()
    console.log('   ✓ Disconnected')

    console.log('\n=== Test Complete ===')
    process.exit(0)
  } catch (error: any) {
    console.error('\nTest failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// テストを実行
if (import.meta.url === `file://${process.argv[1]}`) {
  testTimeMCPServer().catch(console.error)
}