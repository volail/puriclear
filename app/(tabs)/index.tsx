import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { useImagePicker } from '../../src/hooks/useImagePicker'
import { PermissionDeniedView } from '../../src/components/PermissionDeniedView'

export default function UploadScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const { pickFromCamera, pickFromLibrary, cameraPermissionDenied, libraryPermissionDenied } =
    useImagePicker()

  async function handleCamera() {
    try {
      const asset = await pickFromCamera()
      if (asset) {
        router.push({
          pathname: '/preview',
          params: { uri: asset.uri, mimeType: asset.mimeType },
        })
      }
    } catch (err: any) {
      if (err.message === 'IMAGE_TOO_LARGE') Alert.alert(t('upload.tooLarge'))
      else Alert.alert(t('common.error'))
    }
  }

  async function handleLibrary() {
    try {
      const asset = await pickFromLibrary()
      if (asset) {
        router.push({
          pathname: '/preview',
          params: { uri: asset.uri, mimeType: asset.mimeType },
        })
      }
    } catch (err: any) {
      if (err.message === 'IMAGE_TOO_LARGE') Alert.alert(t('upload.tooLarge'))
      else Alert.alert(t('common.error'))
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('common.appName')}</Text>

      {cameraPermissionDenied && <PermissionDeniedView type="camera" />}
      {libraryPermissionDenied && <PermissionDeniedView type="library" />}

      <View style={styles.actions}>
        {Platform.OS !== 'web' && (
          <TouchableOpacity onPress={handleCamera} style={[styles.actionButton, styles.pinkButton]}>
            <Text style={styles.actionIcon}>📷</Text>
            <Text style={styles.actionLabel}>{t('upload.takePhoto')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={handleLibrary} style={[styles.actionButton, styles.lavenderButton]}>
          <Text style={styles.actionIcon}>🖼️</Text>
          <Text style={styles.actionLabel}>{t('upload.importLibrary')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF9FB',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
    padding: 24,
  },
  title: { fontSize: 28, fontWeight: '700', color: '#C8B4E8' },
  actions: { flexDirection: 'row', gap: 16 },
  actionButton: {
    width: 140,
    height: 140,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pinkButton: { backgroundColor: '#FFB7C5' },
  lavenderButton: { backgroundColor: '#C8B4E8' },
  actionIcon: { fontSize: 40 },
  actionLabel: { color: 'white', fontWeight: '600', fontSize: 14, textAlign: 'center' },
})
