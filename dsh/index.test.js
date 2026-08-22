import { describe, expect, it, vi } from 'vitest'
import { apply, inject, name } from './index.js'

describe('dsh plugin', () => {
  it('registers an IlloAI generation tool backed by the bundled CLI', () => {
    const register = vi.fn()

    apply({ tools: { register } })

    expect(name).toBe('illoai')
    expect(inject).toEqual(['tools'])
    expect(register).toHaveBeenCalledOnce()
    expect(register.mock.calls[0]?.[0]).toMatchObject({
      name: 'illoai_generate_image',
      parameters: {
        required: ['text'],
      },
    })
  })
})
