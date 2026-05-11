import React, { useState } from 'react'
import { View, Image, TouchableOpacity, Text, StyleSheet, Alert } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { LoadingOverlay } from '../src/components/LoadingOverlay'
import { invokeProcessImage } from '../src/lib/processImage'

export default function Preview() {
  const { t } = useTranslation()
  const router = useRouter()
  const { uri, mimeType } = useLocalSearchParams<{ uri: string; mimeType: string }>()
  const [processing, setProcessing] = useState(false)

  async function handleUpscale() {
    if (!uri) return
    try {
      setProcessing(true)
      const result = await invokeProcessImage(uri, mimeType ?? 'image/jpeg')
      router.replace({
        pathname: '/(tabs)/gallery/[id]',
        params: { id: result.upload_id, signedUrl: result.signed_url },
      })
    } catch (err: any) {
      if (err.message === 'QUOTA_EXCEEDED') {
        router.replace('/subscription')
      } else {
        Alert.alert(t('errors.processingFailed'))
      }
    } finally {
      setProcessing(false)
    }
  }

  return (
    <View style={styles.container}>
      {processing && <LoadingOverlay />}
      {uri && (
        <Image source={{ uri }} style={styles.image} resizeMode="contain" />
      )}
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={handleUpscale}
          disabled={processing}
          style={[styles.button, styles.upscaleButton, processing && styles.disabled]}
        >
          <Text style={styles.upscaleText}>{t('preview.upscaleButton')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.back()}
          disabled={processing}
          style={styles.cancelButton}
        >
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  image: { flex: 1 },
  actions: {
    padding: 16,
    gap: 12,
    backgroundColor: '#FFF9FB',
  },
  button: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upscaleButton: { backgroundColor: '#C8B4E8' },
  upscaleText: { color: 'white', fontSize: 18, fontWeight: '700' },
  cancelButton: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { color: '#2D2D2D', opacity: 0.6 },
  disabled: { opacity: 0.5 },
})
