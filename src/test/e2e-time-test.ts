#!/usr/bin/env node
/**
 * E2E Time MCP Test
 * VoltAgent経由でLLMがtimeツールを使えることを確認するE2Eテスト
 */

import { spawn, ChildProcess } from 'child_process'

/**
 * サーバーが起動するまで待機
 */
async function waitForServer(url: string, maxRetries = 30, delay = 1000): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // VoltAgentは/uiや/agents/{id}/を提供している
      const response = await fetch(`${url}/ui`)
      if (response.status === 200 || response.status === 302) {
        return true
      }
    } catch (error) {
      // サーバーがまだ起動していない
    }
    await new Promise(resolve => setTimeout(resolve, delay))
  }
  return false
}

/**
 * 時刻が妥当かチェック
 */
function isTimeValid(responseText: string, tolerance: number = 60000): boolean {
  // 様々な時刻フォーマットをパース
  const patterns = [
    // ISO形式: 2025-08-08T18:52:43
    /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
    // 日本語形式（時分秒あり）: 2025年8月8日 18時52分43秒
    /(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2})[時:時:](\d{1,2})[分:分:](\d{1,2})[秒:秒:]?/,
    // 日本語形式（時分のみ）: 2025年8月8日 18:52
    /(\d{4})年(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{1,2})/,
    // スラッシュ形式: 2025/8/8 18:52:43
    /(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/,
    // Unix timestamp: 1754646763
    /\b(1[67]\d{8})\b/,
  ]

  const now = Date.now()
  
  for (const pattern of patterns) {
    const match = responseText.match(pattern)
    if (match) {
      let timestamp: number
      
      if (match[0].match(/^\d{10}$/)) {
        // Unix timestamp
        timestamp = parseInt(match[0]) * 1000
      } else {
        // 日付形式
        const year = parseInt(match[1])
        const month = parseInt(match[2]) - 1
        const day = parseInt(match[3])
        const hour = parseInt(match[4] || '0')
        const minute = parseInt(match[5] || '0')
        const second = parseInt(match[6] || '0')
        
        // UTCベースで作成（タイムゾーン考慮）
        timestamp = Date.UTC(year, month, day, hour, minute, second)
        
        // 日本時間の場合は9時間引く（UTC+9）
        if (responseText.includes('東京') || responseText.includes('Tokyo')) {
          timestamp -= 9 * 60 * 60 * 1000
        }
        // ニューヨーク時間の場合は5時間足す（UTC-5、夏時間は-4）
        else if (responseText.includes('ニューヨーク') || responseText.includes('New York')) {
          timestamp += 4 * 60 * 60 * 1000 // 夏時間考慮
        }
      }
      
      const diff = Math.abs(now - timestamp)
      console.log(`   Found time: ${match[0]}, Diff from now: ${diff}ms`)
      
      if (diff < tolerance) {
        return true
      }
    }
  }
  
  return false
}

/**
 * E2Eテストを実行
 */
async function runE2ETest() {
  console.log('=== E2E Time MCP Test ===\n')
  
  let serverProcess: ChildProcess | null = null
  
  try {
    // 1. サーバーを起動
    console.log('1. Starting VoltAgent server...')
    serverProcess = spawn('npm', ['start'], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    
    // サーバーログを表示（デバッグ用）
    serverProcess.stdout?.on('data', (data) => {
      console.log(`   [Server]: ${data.toString().trim()}`)
    })
    
    serverProcess.stderr?.on('data', (data) => {
      console.error(`   [Server Error]: ${data.toString().trim()}`)
    })
    
    // サーバーが起動するまで待機
    console.log('2. Waiting for server to be ready...')
    const serverUrl = 'http://localhost:3141'
    const isReady = await waitForServer(serverUrl)
    
    if (!isReady) {
      throw new Error('Server failed to start')
    }
    
    console.log('   ✓ Server is ready\n')
    
    // 2. テストケースを実行
    const testCases = [
      {
        name: 'Get current time with time tool',
        prompt: '今の時刻を教えてください。必ずtime_get_current_timeツールを使って取得してください。',
        validateTime: true,
      },
      {
        name: 'Get Tokyo time',
        prompt: '東京の現在時刻を教えてください。time_get_current_timeツールでtimezoneをAsia/Tokyoに設定してください。',
        validateTime: true,
      },
      {
        name: 'Get Unix timestamp',
        prompt: '現在のUnixタイムスタンプを取得してください。time_get_current_timeツールでformatをunixに設定してください。',
        validateTime: true,
      },
      {
        name: 'Get New York time',
        prompt: 'ニューヨークの現在時刻を教えてください。time_get_current_timeツールでtimezoneをAmerica/New_Yorkに設定してください。',
        validateTime: true,
      },
    ]
    
    let passedTests = 0
    let failedTests = 0
    
    for (const testCase of testCases) {
      console.log(`3. Test Case: ${testCase.name}`)
      console.log(`   Prompt: "${testCase.prompt}"`)
      
      try {
        // APIリクエストを送信
        const response = await fetch(`${serverUrl}/agents/main/text-custom`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: testCase.prompt,
            options: {
              userId: 'test-user',
              conversationId: 'test-conversation',
            }
          })
        })
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        
        const result = await response.json() as any
        
        if (!result.success) {
          throw new Error(result.error || 'Unknown error')
        }
        
        console.log(`   Response: ${result.data.text}`)
        
        // ツール使用状況を確認
        if (result.data.toolCalls && result.data.toolCalls.length > 0) {
          console.log('   Tools used:')
          result.data.toolCalls.forEach((call: any) => {
            console.log(`     - ${call.toolName} with args:`, JSON.stringify(call.args))
          })
        }
        
        // 時刻の妥当性を検証
        if (testCase.validateTime) {
          const isValid = isTimeValid(result.data.text)
          if (isValid) {
            console.log('   ✓ Time validation: PASSED\n')
            passedTests++
          } else {
            console.log('   ✗ Time validation: FAILED (time not found or too far from current time)\n')
            failedTests++
          }
        } else {
          console.log('   ✓ Test completed\n')
          passedTests++
        }
        
      } catch (error: any) {
        console.error(`   ✗ Error: ${error.message}\n`)
        failedTests++
      }
    }
    
    // 3. テスト結果のサマリー
    console.log('=== Test Summary ===')
    console.log(`   Passed: ${passedTests}`)
    console.log(`   Failed: ${failedTests}`)
    console.log(`   Total: ${passedTests + failedTests}`)
    
    if (failedTests === 0) {
      console.log('\n✅ All tests passed!')
    } else {
      console.log('\n❌ Some tests failed')
      process.exitCode = 1
    }
    
  } catch (error: any) {
    console.error('E2E test failed:', error.message)
    process.exitCode = 1
  } finally {
    // サーバーを停止
    if (serverProcess) {
      console.log('\n4. Stopping server...')
      serverProcess.kill('SIGTERM')
      
      // プロセスが終了するまで待機
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // まだ生きていたら強制終了
      try {
        serverProcess.kill('SIGKILL')
      } catch (e) {
        // Already dead
      }
      
      console.log('   ✓ Server stopped')
    }
  }
  
  console.log('\n=== Test Complete ===')
}

// テストを実行
if (import.meta.url === `file://${process.argv[1]}`) {
  runE2ETest().catch(console.error)
}