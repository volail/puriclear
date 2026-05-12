import React, { useEffect, useState } from 'react'
import { Alert } from 'react-native'
import { YStack, XStack } from '@tamagui/stacks'
import { Button } from '@tamagui/button'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../../src/lib/supabase'
import { getUploadSignedUrl } from '../../../src/lib/signedUrls'
import { useShare } from '../../../src/hooks/useShare'
import { useMediaSave } from '../../../src/hooks/useMediaSave'
import { ZoomableImage } from '../../../src/components/ZoomableImage'

export default function PhotoDetail() {
  const { t } = useTranslation()
  const router = useRouter()
  const { id, signedUrl: initialUrl } = useLocalSearchParams<{ id: string; signedUrl?: string }>()
  const [url, setUrl] = useState<string | null>(
    typeof initialUrl === 'string' ? initialUrl : null
  )
  const { shareUrl } = useShare()
  const { saveToDevice } = useMediaSave()

  useEffect(() => {
    if (!url && id && typeof id === 'string') {
      getUploadSignedUrl(id).then(setUrl).catch(() => {})
    }
  }, [id])

  async function handleShare() {
    if (!url) return
    try { await shareUrl(url) } catch {}
  }

  async function handleSave() {
    if (!url) return
    const { saved, denied } = await saveToDevice(url)
    if (saved) Alert.alert(t('gallery.saveSuccess'))
    else if (denied) Alert.alert(t('gallery.saveDenied'))
  }

  async function handleDelete() {
    if (!id || typeof id !== 'string') return
    Alert.alert(
      t('gallery.deleteConfirmTitle'),
      t('gallery.deleteConfirmMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            await supabase.from('uploads').delete().eq('id', id)
            router.replace('/(tabs)/gallery')
          },
        },
      ]
    )
  }

  return (
    <YStack flex={1} backgroundColor="black">
      {url && <ZoomableImage uri={url} />}
      <YStack padding="$4" gap="$3" backgroundColor="$cream">
        <XStack gap="$3">
          <Button flex={1} onPress={handleShare} backgroundColor="$lavender" color="white" borderRadius="$6">
            {t('common.share')}
          </Button>
          <Button flex={1} onPress={handleSave} backgroundColor="$pink" color="white" borderRadius="$6">
            {t('common.save')}
          </Button>
        </XStack>
        <Button onPress={handleDelete} backgroundColor="transparent" color="red" borderRadius="$6">
          {t('common.delete')}
        </Button>
      </YStack>
    </YStack>
  )
}
