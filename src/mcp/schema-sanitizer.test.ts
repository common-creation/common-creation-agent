/**
 * Schema Sanitizer Tests
 */

import { describe, it, expect } from 'vitest'
import { sanitizeToolSchema, sanitizeTools } from './schema-sanitizer.js'
import type { MCPTool } from './types.js'

describe('Schema Sanitizer', () => {
  describe('sanitizeToolSchema', () => {
    it('should remove inputSchema from tool', () => {
      const tool: MCPTool = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {
            param1: { type: 'string' },
          },
        },
      }
      const result = sanitizeToolSchema(tool)
      expect(result.name).toBe('test_tool')
      expect(result.description).toBe('Test tool')
      expect(result.inputSchema).toBeUndefined()
    })

    it('should preserve tool without inputSchema', () => {
      const tool: MCPTool = {
        name: 'test_tool',
        description: 'Test tool',
      }
      const result = sanitizeToolSchema(tool)
      expect(result).toEqual(tool)
    })

    it('should remove inputSchema with Zod schema object', () => {
      const tool: MCPTool = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          _def: {
            typeName: 'ZodObject',
          },
          type: 'object',
          properties: {
            param1: { type: 'string' },
          },
        } as any,
      }
      const result = sanitizeToolSchema(tool)
      expect(result.name).toBe('test_tool')
      expect(result.inputSchema).toBeUndefined()
    })

    it('should remove complex nested inputSchema', () => {
      const tool: MCPTool = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                email: { type: 'string' },
              },
            },
          },
        },
      }
      const result = sanitizeToolSchema(tool)
      expect(result.inputSchema).toBeUndefined()
    })

    it('should not modify original tool object', () => {
      const tool: MCPTool = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {
            param1: { type: 'string' },
          },
        },
      }
      const original = { ...tool }
      sanitizeToolSchema(tool)
      expect(tool).toEqual(original)
    })
  })

  describe('sanitizeTools', () => {
    it('should remove inputSchema from all tools', () => {
      const tools: MCPTool[] = [
        {
          name: 'tool1',
          description: 'Tool 1',
          inputSchema: {
            type: 'object',
            properties: {
              param1: { type: 'string' },
            },
          },
        },
        {
          name: 'tool2',
          description: 'Tool 2',
          inputSchema: {
            type: 'object',
            properties: {
              param2: { type: 'number' },
            },
          },
        },
      ]
      const result = sanitizeTools(tools)
      expect(result).toHaveLength(2)
      expect(result[0].inputSchema).toBeUndefined()
      expect(result[1].inputSchema).toBeUndefined()
      expect(result[0].name).toBe('tool1')
      expect(result[1].name).toBe('tool2')
    })

    it('should handle mix of tools with and without inputSchema', () => {
      const tools: MCPTool[] = [
        {
          name: 'tool_with_schema',
          description: 'Tool with schema',
          inputSchema: {
            type: 'object',
            properties: {
              param1: { type: 'string' },
            },
          },
        },
        {
          name: 'tool_without_schema',
          description: 'Tool without schema',
        },
      ]
      const result = sanitizeTools(tools)
      expect(result).toHaveLength(2)
      expect(result[0].inputSchema).toBeUndefined()
      expect(result[1].inputSchema).toBeUndefined()
    })

    it('should handle empty tool array', () => {
      const tools: MCPTool[] = []
      const result = sanitizeTools(tools)
      expect(result).toHaveLength(0)
    })

    it('should preserve all other tool properties', () => {
      const tools: MCPTool[] = [
        {
          name: 'test_tool',
          description: 'Test tool',
          inputSchema: {
            type: 'object',
          },
        },
      ]
      const result = sanitizeTools(tools)
      expect(result[0].name).toBe('test_tool')
      expect(result[0].description).toBe('Test tool')
    })
  })
})
