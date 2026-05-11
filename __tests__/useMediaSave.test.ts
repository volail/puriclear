import { renderHook, act } from '@testing-library/react-native'
import { useMediaSave } from '../src/hooks/useMediaSave'

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  saveToLibraryAsync: jest.fn().mockResolvedValue(undefined),
}))

test('saveToDevice calls saveToLibraryAsync on mobile', async () => {
  const { result } = renderHook(() => useMediaSave())
  await act(async () => { await result.current.saveToDevice('file://photo.jpg') })
  const { saveToLibraryAsync } = require('expo-media-library')
  expect(saveToLibraryAsync).toHaveBeenCalledWith('file://photo.jpg')
})

test('returns permissionDenied when denied', async () => {
  const mediaLibrary = require('expo-media-library')
  mediaLibrary.requestPermissionsAsync.mockResolvedValueOnce({ granted: false })
  const { result } = renderHook(() => useMediaSave())
  await act(async () => { await result.current.saveToDevice('file://photo.jpg') })
  expect(result.current.permissionDenied).toBe(true)
})
