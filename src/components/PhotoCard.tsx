import React, { useEffect, useState } from 'react'
import { View } from '@tamagui/core'
import { Image, TouchableOpacity, StyleSheet } from 'react-native'
import { getSignedUrl } from '../lib/signedUrls'

type Props = {
  upscaledPath: string
  onPress: () => void
}

export function PhotoCard({ upscaledPath, onPress }: Props) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getSignedUrl(upscaledPath, 400).then(u => { if (!cancelled) setUrl(u) }).catch(() => {})
    return () => { cancelled = true }
  }, [upscaledPath])

  return (
    <TouchableOpacity onPress={onPress} style={styles.container} activeOpacity={0.8}>
      <View backgroundColor="$grey" borderRadius="$4" overflow="hidden" style={styles.card}>
        {url && <Image source={{ uri: url }} style={styles.image} />}
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, margin: 4 },
  card: { aspectRatio: 1 },
  image: { width: '100%', height: '100%' },
})
