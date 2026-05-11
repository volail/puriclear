import { invokeProcessImage } from '../src/lib/processImage'

// jest-expo runs with platform 'ios' — native path uses expo-file-system
jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn().mockResolvedValue('abc123'),
  EncodingType: { Base64: 'base64' },
}))

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

test('returns upload_id and signed_url on native', async () => {
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

test('throws PROCESSING_FAILED when data is incomplete', async () => {
  const { supabase } = require('../src/lib/supabase')
  supabase.functions.invoke.mockResolvedValueOnce({
    data: { upload_id: 'abc123' }, // missing signed_url
    error: null,
  })
  await expect(invokeProcessImage('file://photo.jpg', 'image/jpeg')).rejects.toThrow('PROCESSING_FAILED')
})

test('throws when FileSystem.readAsStringAsync fails', async () => {
  const FileSystem = require('expo-file-system')
  FileSystem.readAsStringAsync.mockRejectedValueOnce(new Error('file not found'))
  await expect(invokeProcessImage('file://bad.jpg', 'image/jpeg')).rejects.toThrow('file not found')
})
