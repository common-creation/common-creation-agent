#!/usr/bin/env tsx

/**
 * Context7 MCP Integration Test
 * Context7経由でライブラリドキュメントを取得するテスト
 */

import { MCPManager } from '../src/mcp/index.js'

async function testContext7() {
  console.log('🧪 Testing Context7 MCP integration...\n')

  const mcpManager = new MCPManager()

  try {
    // MCPサーバーを初期化
    await mcpManager.initializeServers()
    
    // 利用可能なツールを取得
    const tools = await mcpManager.getAvailableTools()
    console.log('📦 Available MCP tools:')
    tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`)
    })
    console.log()

    // Context7のツールが利用可能か確認
    const context7Tools = tools.filter(tool => 
      tool.name.includes('resolve-library-id') || tool.name.includes('get-library-docs')
    )

    if (context7Tools.length === 0) {
      console.log('❌ Context7 tools not found!')
      return
    }

    console.log('✅ Context7 tools found!')
    console.log()

    // テスト: React のドキュメントを検索
    console.log('🔍 Searching for React library...')
    const resolveResult = await mcpManager.executeToolCall(
      'context7_resolve-library-id',
      { libraryName: 'react' }
    )
    console.log('Library search result:', JSON.stringify(resolveResult, null, 2))
    console.log()

    // 検索結果からライブラリIDを取得
    if (resolveResult && resolveResult.libraries && resolveResult.libraries.length > 0) {
      const libraryId = resolveResult.libraries[0].id
      console.log(`📚 Getting documentation for library: ${libraryId}`)
      
      const docsResult = await mcpManager.executeToolCall(
        'context7_get-library-docs',
        { 
          context7CompatibleLibraryID: libraryId,
          tokens: 1000,
          topic: 'hooks'
        }
      )
      
      console.log('Documentation preview:')
      console.log(docsResult?.content?.substring(0, 500) + '...')
    }

  } catch (error) {
    console.error('❌ Test failed:', error)
  } finally {
    await mcpManager.disconnect()
  }
}

// 実行
testContext7().catch(console.error)