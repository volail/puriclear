import React, { useEffect, useState } from 'react'
import { FlatList, RefreshControl } from 'react-native'
import { View } from '@tamagui/core'
import { useRouter } from 'expo-router'
import { useGallery } from '../../../src/hooks/useGallery'
import { PhotoCard } from '../../../src/components/PhotoCard'
import { EmptyGallery } from '../../../src/components/EmptyGallery'

const NUM_COLS = 2

export default function GalleryScreen() {
  const router = useRouter()
  const { uploads, loading, refresh, loadMore } = useGallery()

  const [initialised, setInitialised] = useState(false)

  useEffect(() => {
    setInitialised(false)
    refresh().finally(() => setInitialised(true))
  }, [refresh])

  if (initialised && !loading && uploads.length === 0) return <EmptyGallery />

  return (
    <View flex={1} backgroundColor="$cream">
      <FlatList
        data={uploads}
        keyExtractor={item => item.id}
        numColumns={NUM_COLS}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor="#C8B4E8" />}
        renderItem={({ item }) => (
          <PhotoCard
            upscaledPath={item.upscaled_path}
            thumbnailPath={item.thumbnail_path}
            onPress={() => router.push({ pathname: '/(tabs)/gallery/[id]', params: { id: item.id } })}
          />
        )}
        contentContainerStyle={{ padding: 4 }}
      />
    </View>
  )
}
