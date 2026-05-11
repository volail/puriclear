import React from 'react'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'

export function LoadingOverlay() {
  const { t } = useTranslation()
  return (
    <View style={styles.overlay}>
      <ActivityIndicator size="large" color="#C8B4E8" />
      <Text style={styles.text}>{t('common.processing')}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,249,251,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    zIndex: 100,
  },
  text: { fontSize: 18, fontWeight: '600', color: '#C8B4E8' },
})
