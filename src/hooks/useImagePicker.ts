import { useState } from 'react'
import * as ImagePicker from 'expo-image-picker'
import { Platform } from 'react-native'

export type PickedAsset = {
  uri: string
  mimeType: string
  fileSize: number
}

const MAX_SIZE_BYTES = 20 * 1024 * 1024

export function useImagePicker() {
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false)
  const [libraryPermissionDenied, setLibraryPermissionDenied] = useState(false)

  async function pickFromCamera(): Promise<PickedAsset | null> {
    if (Platform.OS === 'web') return null
    const { granted } = await ImagePicker.requestCameraPermissionsAsync()
    if (!granted) {
      setCameraPermissionDenied(true)
      return null
    }
    setCameraPermissionDenied(false)
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    })
    if (result.canceled || !result.assets[0]) return null
    const asset = result.assets[0]
    if (asset.fileSize && asset.fileSize > MAX_SIZE_BYTES) throw new Error('IMAGE_TOO_LARGE')
    return { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', fileSize: asset.fileSize ?? 0 }
  }

  async function pickFromLibrary(): Promise<PickedAsset | null> {
    if (Platform.OS !== 'web') {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!granted) {
        setLibraryPermissionDenied(true)
        return null
      }
      setLibraryPermissionDenied(false)
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    })
    if (result.canceled || !result.assets[0]) return null
    const asset = result.assets[0]
    if (asset.fileSize && asset.fileSize > MAX_SIZE_BYTES) throw new Error('IMAGE_TOO_LARGE')
    return { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', fileSize: asset.fileSize ?? 0 }
  }

  return { pickFromCamera, pickFromLibrary, cameraPermissionDenied, libraryPermissionDenied }
}
