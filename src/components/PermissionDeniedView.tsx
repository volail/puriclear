import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native'
import { useTranslation } from 'react-i18next'

type Props = { type: 'camera' | 'library' }

export function PermissionDeniedView({ type }: Props) {
  const { t } = useTranslation()
  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        {type === 'camera'
          ? t('upload.permissionExplanationCamera')
          : t('upload.permissionExplanationLibrary')}
      </Text>
      <TouchableOpacity onPress={() => Linking.openSettings()} style={styles.button}>
        <Text style={styles.buttonText}>{t('upload.openSettings')}</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 12, padding: 16 },
  text: { textAlign: 'center', color: '#2D2D2D', opacity: 0.7, fontSize: 14 },
  button: {
    backgroundColor: '#C8B4E8',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  buttonText: { color: 'white', fontWeight: '600' },
})
