/**
 * MCP Tool Integration Test
 * MCPツールの統合テスト
 */

import { Agent } from '@voltagent/core'
import { openai } from '@ai-sdk/openai'
import { MCPManager } from '../mcp/index.js'

/**
 * MCPツールの統合テストを実行
 */
async function testMCPToolIntegration() {
  console.log('=== MCP Tool Integration Test ===\n')

  try {
    // MCPマネージャーを初期化
    console.log('1. Initializing MCP Manager...')
    const mcpManager = new MCPManager()
    await mcpManager.initializeServers()

    // 利用可能なツールを取得
    const tools = await mcpManager.getAvailableTools()
    console.log(`   ✓ Loaded ${tools.length} MCP tools`)

    if (tools.length > 0) {
      console.log('   Available tools:')
      tools.forEach(tool => {
        console.log(`     - ${tool.name}: ${tool.description || 'No description'}`)
      })
    }

    // OpenAI モデルを作成
    console.log('\n2. Creating OpenAI model...')
    // 環境変数を設定
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key'
    const model = openai('gpt-4o-mini')

    // エージェントを作成
    console.log('\n3. Creating agent with MCP tools...')
    const agent = new Agent({
      id: 'test-agent',
      name: 'MCP Test Agent',
      instructions: `あなたはMCPツールをテストするためのエージェントです。
利用可能なツールを使って質問に答えてください。
ツールを使用した場合は、どのツールを使ったか明示してください。`,
      model: model,
      tools: tools as any, // MCPToolの型をVoltAgentのTool型にキャスト
      markdown: true,
      maxSteps: 5, // 最大5回までツールを実行
    })

    // テストケース1: 時刻を取得
    console.log('\n4. Test Case 1: Getting current time')
    console.log('   Prompt: "今の時刻を教えてください"')
    
    try {
      const result1 = await agent.generateText('今の時刻を教えてください', {
        temperature: 0.7,
      })

      console.log('   Response:', result1.text)
      if (result1.toolCalls && result1.toolCalls.length > 0) {
        console.log('   Tools used:')
        result1.toolCalls.forEach(call => {
          console.log(`     - ${call.toolName}`)
        })
      }
    } catch (error: any) {
      console.error('   Error:', error.message)
    }

    // テストケース2: ファイル操作
    console.log('\n5. Test Case 2: File operations')
    console.log('   Prompt: "./data ディレクトリの内容を確認してください"')
    
    try {
      const result2 = await agent.generateText('./data ディレクトリの内容を確認してください', {
        temperature: 0.7,
      })

      console.log('   Response:', result2.text)
      if (result2.toolCalls && result2.toolCalls.length > 0) {
        console.log('   Tools used:')
        result2.toolCalls.forEach(call => {
          console.log(`     - ${call.toolName}`)
        })
      }
    } catch (error: any) {
      console.error('   Error:', error.message)
    }

    // テストケース3: 連続的思考
    console.log('\n6. Test Case 3: Sequential thinking')
    console.log('   Prompt: "フィボナッチ数列の最初の10項を計算してください。ステップバイステップで考えてください。"')
    
    try {
      const result3 = await agent.generateText(
        'フィボナッチ数列の最初の10項を計算してください。ステップバイステップで考えてください。',
        {
          temperature: 0.7,
        }
      )

      console.log('   Response:', result3.text)
      if (result3.toolCalls && result3.toolCalls.length > 0) {
        console.log('   Tools used:')
        result3.toolCalls.forEach(call => {
          console.log(`     - ${call.toolName}`)
        })
      }
    } catch (error: any) {
      console.error('   Error:', error.message)
    }

    // MCPマネージャーを切断
    console.log('\n7. Disconnecting MCP Manager...')
    await mcpManager.disconnect()
    console.log('   ✓ Disconnected')

    console.log('\n=== Test Complete ===')
  } catch (error: any) {
    console.error('\nTest failed:', error.message)
    process.exit(1)
  }
}

// テストを実行
if (import.meta.url === `file://${process.argv[1]}`) {
  testMCPToolIntegration().catch(console.error)
}