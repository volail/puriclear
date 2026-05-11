import { Platform } from 'react-native'
import * as MediaLibrary from 'expo-media-library'

type SaveResult = { saved: boolean; denied: boolean }

export function useMediaSave() {
  async function saveToDevice(uri: string): Promise<SaveResult> {
    if (Platform.OS === 'web') {
      const a = document.createElement('a')
      a.href = uri
      a.download = 'puriclear.jpg'
      a.click()
      return { saved: true, denied: false }
    }
    const { granted } = await MediaLibrary.requestPermissionsAsync()
    if (!granted) return { saved: false, denied: true }
    await MediaLibrary.saveToLibraryAsync(uri)
    return { saved: true, denied: false }
  }

  return { saveToDevice }
}
