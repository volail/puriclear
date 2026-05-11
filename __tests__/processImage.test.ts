import { invokeProcessImage } from '../src/lib/processImage'

// Mock fetch globally
global.fetch = jest.fn().mockResolvedValue({
  blob: jest.fn().mockResolvedValue(new Blob(['data'], { type: 'image/jpeg' })),
})

// Mock FileReader
global.FileReader = class {
  result: string = ''
  onloadend: (() => void) | null = null
  onerror: (() => void) | null = null
  readAsDataURL(blob: Blob) {
    this.result = 'data:image/jpeg;base64,abc123'
    setTimeout(() => this.onloadend?.(), 0)
  }
} as any

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: jest.fn().mockResolvedValue({
        data: { upload_id: 'abc123', signed_url: 'https://example.com/img.jpg' },
        error: null,
      }),
    },
  },
}))

test('returns upload_id and signed_url', async () => {
  const result = await invokeProcessImage('file://photo.jpg', 'image/jpeg')
  expect(result.upload_id).toBe('abc123')
  expect(result.signed_url).toBe('https://example.com/img.jpg')
})

test('throws on QUOTA_EXCEEDED error', async () => {
  const { supabase } = require('../src/lib/supabase')
  supabase.functions.invoke.mockResolvedValueOnce({
    data: null,
    error: { message: 'QUOTA_EXCEEDED' },
  })
  await expect(invokeProcessImage('file://photo.jpg', 'image/jpeg')).rejects.toThrow('QUOTA_EXCEEDED')
})
