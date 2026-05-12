import React, { useEffect, useState } from 'react'
import { View } from '@tamagui/core'
import { Image, TouchableOpacity, StyleSheet } from 'react-native'
import { getSignedUrl } from '../lib/signedUrls'

type Props = {
  upscaledPath: string
  thumbnailPath: string | null
  onPress: () => void
}

export function PhotoCard({ upscaledPath, thumbnailPath, onPress }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (thumbnailPath) {
        try {
          const u = await getSignedUrl(thumbnailPath)
          if (!cancelled) { setUrl(u); return }
        } catch (e) {
          console.warn('[PhotoCard] thumbnail failed, falling back to upscaled', e)
        }
      }
      try {
        const u = await getSignedUrl(upscaledPath)
        if (!cancelled) setUrl(u)
      } catch (e) {
        console.error('[PhotoCard] upscaled also failed', e)
      }
    }
    load()
    return () => { cancelled = true }
  }, [thumbnailPath, upscaledPath])

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
