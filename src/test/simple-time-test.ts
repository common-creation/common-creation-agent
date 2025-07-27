#!/usr/bin/env node
/**
 * Simple Time MCP Test
 * time MCPサーバーの簡単なテスト
 */

import { MCPManager } from '../mcp/index.js'

async function simpleTimeTest() {
  console.log('=== Simple Time MCP Test ===\n')

  const mcpManager = new MCPManager()
  
  try {
    // MCPサーバーを初期化
    console.log('1. Initializing MCP servers...')
    await mcpManager.initializeServers()
    
    // ツール一覧を取得
    console.log('\n2. Getting available tools...')
    const tools = await mcpManager.getAvailableTools()
    console.log(`   Total tools: ${tools.length}`)
    
    // time関連のツールを探す
    const timeTools = tools.filter(tool => 
      tool.name.toLowerCase().includes('time')
    )
    
    console.log(`   Time-related tools: ${timeTools.length}`)
    timeTools.forEach(tool => {
      console.log(`   - ${tool.name}`)
      console.log(`     Description: ${tool.description || 'No description'}`)
      console.log(`     Tool info:`, JSON.stringify(tool, null, 2))
    })
    
    // time_get_current_timeツールを直接呼び出し
    console.log('\n3. Testing time_get_current_time tool...')
    
    // UTC時刻を取得
    console.log('\n   Test 1: UTC time (default)')
    try {
      const utcResult = await mcpManager.executeToolCall('time_get_current_time', {})
      console.log('   Result:', JSON.stringify(utcResult, null, 2))
    } catch (error: any) {
      console.error('   Error:', error.message)
    }
    
    // 東京時刻を取得
    console.log('\n   Test 2: Tokyo time')
    try {
      const tokyoResult = await mcpManager.executeToolCall('time_get_current_time', {
        timezone: 'Asia/Tokyo',
        format: 'locale'
      })
      console.log('   Result:', JSON.stringify(tokyoResult, null, 2))
    } catch (error: any) {
      console.error('   Error:', error.message)
    }
    
    // Unix timestampを取得
    console.log('\n   Test 3: Unix timestamp')
    try {
      const unixResult = await mcpManager.executeToolCall('time_get_current_time', {
        format: 'unix'
      })
      console.log('   Result:', JSON.stringify(unixResult, null, 2))
    } catch (error: any) {
      console.error('   Error:', error.message)
    }
    
    // ニューヨーク時刻を取得
    console.log('\n   Test 4: New York time')
    try {
      const nyResult = await mcpManager.executeToolCall('time_get_current_time', {
        timezone: 'America/New_York',
        format: 'ISO'
      })
      console.log('   Result:', JSON.stringify(nyResult, null, 2))
    } catch (error: any) {
      console.error('   Error:', error.message)
    }
    
  } catch (error: any) {
    console.error('Test failed:', error.message)
  } finally {
    // MCPサーバーを切断
    console.log('\n4. Disconnecting...')
    await mcpManager.disconnect()
    console.log('   ✓ Disconnected')
  }
  
  console.log('\n=== Test Complete ===')
}

// 実行
simpleTimeTest().catch(console.error)