import { renderHook, act } from '@testing-library/react-native'
import { useMediaSave } from '../src/hooks/useMediaSave'

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  saveToLibraryAsync: jest.fn().mockResolvedValue(undefined),
}))

test('saveToDevice calls saveToLibraryAsync on mobile and returns saved:true', async () => {
  const { result } = renderHook(() => useMediaSave())
  let saveResult: any
  await act(async () => { saveResult = await result.current.saveToDevice('file://photo.jpg') })
  const { saveToLibraryAsync } = require('expo-media-library')
  expect(saveToLibraryAsync).toHaveBeenCalledWith('file://photo.jpg')
  expect(saveResult.saved).toBe(true)
  expect(saveResult.denied).toBe(false)
})

test('returns denied:true when permission denied', async () => {
  const mediaLibrary = require('expo-media-library')
  mediaLibrary.requestPermissionsAsync.mockResolvedValueOnce({ granted: false })
  const { result } = renderHook(() => useMediaSave())
  let saveResult: any
  await act(async () => { saveResult = await result.current.saveToDevice('file://photo.jpg') })
  expect(saveResult.saved).toBe(false)
  expect(saveResult.denied).toBe(true)
})
