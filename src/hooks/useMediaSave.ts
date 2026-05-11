import { useState } from 'react'
import { Platform } from 'react-native'
import * as MediaLibrary from 'expo-media-library'

export function useMediaSave() {
  const [permissionDenied, setPermissionDenied] = useState(false)

  async function saveToDevice(uri: string): Promise<boolean> {
    if (Platform.OS === 'web') {
      const a = document.createElement('a')
      a.href = uri
      a.download = 'puriclear.jpg'
      a.click()
      return true
    }
    const { granted } = await MediaLibrary.requestPermissionsAsync()
    if (!granted) { setPermissionDenied(true); return false }
    setPermissionDenied(false)
    await MediaLibrary.saveToLibraryAsync(uri)
    return true
  }

  return { saveToDevice, permissionDenied }
}
