import React, { useRef } from 'react'
import { Animated, Image, PanResponder, Platform } from 'react-native'

interface Props {
  uri: string
  style?: object
}

export function ZoomableImage({ uri, style }: Props) {
  const scale = useRef(new Animated.Value(1)).current
  const lastScale = useRef(1)
  const currentScale = useRef(1)
  const initialDistance = useRef(0)

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => e.nativeEvent.touches.length >= 2,
      onMoveShouldSetPanResponder: (e) => e.nativeEvent.touches.length >= 2,
      onPanResponderGrant: (e) => {
        const t = e.nativeEvent.touches
        if (t.length >= 2) {
          const dx = t[1].pageX - t[0].pageX
          const dy = t[1].pageY - t[0].pageY
          initialDistance.current = Math.sqrt(dx * dx + dy * dy)
        }
      },
      onPanResponderMove: (e) => {
        const t = e.nativeEvent.touches
        if (t.length < 2 || initialDistance.current === 0) return
        const dx = t[1].pageX - t[0].pageX
        const dy = t[1].pageY - t[0].pageY
        const dist = Math.sqrt(dx * dx + dy * dy)
        const s = Math.min(Math.max(lastScale.current * (dist / initialDistance.current), 0.5), 5)
        currentScale.current = s
        scale.setValue(s)
      },
      onPanResponderRelease: () => {
        if (currentScale.current < 1) {
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()
          lastScale.current = 1
          currentScale.current = 1
        } else {
          lastScale.current = currentScale.current
        }
      },
    })
  ).current

  if (Platform.OS === 'web') {
    return <Image source={{ uri }} style={[{ flex: 1, resizeMode: 'contain' } as any, style]} />
  }

  return (
    <Animated.View
      style={[{ flex: 1, overflow: 'hidden' }, style]}
      {...panResponder.panHandlers}
    >
      <Animated.Image
        source={{ uri }}
        style={{ flex: 1, resizeMode: 'contain', transform: [{ scale }] }}
      />
    </Animated.View>
  )
}
