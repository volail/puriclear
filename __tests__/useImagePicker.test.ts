import { renderHook, act } from '@testing-library/react-native'
import { useImagePicker } from '../src/hooks/useImagePicker'

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://photo.jpg', mimeType: 'image/jpeg', fileSize: 1000 }],
  }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://lib.jpg', mimeType: 'image/jpeg', fileSize: 1000 }],
  }),
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  requestMediaLibraryPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  MediaTypeOptions: { Images: 'Images' },
}))

test('pickFromCamera returns asset on iOS', async () => {
  const { result } = renderHook(() => useImagePicker())
  let asset: any
  await act(async () => { asset = await result.current.pickFromCamera() })
  expect(asset?.uri).toBe('file://photo.jpg')
})

test('pickFromLibrary returns null when canceled', async () => {
  const picker = require('expo-image-picker')
  picker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: true, assets: [] })
  const { result } = renderHook(() => useImagePicker())
  let asset: any
  await act(async () => { asset = await result.current.pickFromLibrary() })
  expect(asset).toBeNull()
})

test('sets cameraPermissionDenied when camera permission denied', async () => {
  const picker = require('expo-image-picker')
  picker.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false })
  const { result } = renderHook(() => useImagePicker())
  await act(async () => { await result.current.pickFromCamera() })
  expect(result.current.cameraPermissionDenied).toBe(true)
})
