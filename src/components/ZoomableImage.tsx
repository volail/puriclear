import React, { useEffect, useRef } from 'react'
import { Animated, Image, PanResponder, Platform } from 'react-native'

interface Props {
  uri: string
  style?: object
}

export function ZoomableImage({ uri, style }: Props) {
  const scale = useRef(new Animated.Value(1)).current
  const translateX = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(0)).current

  const lastScale = useRef(1)
  const currentScale = useRef(1)
  const initialDistance = useRef(0)
  const lastTranslate = useRef({ x: 0, y: 0 })
  const currentTranslate = useRef({ x: 0, y: 0 })
  const containerSize = useRef({ width: 0, height: 0 })
  const imageNativeSize = useRef({ width: 0, height: 0 })

  useEffect(() => {
    if (Platform.OS !== 'web') {
      Image.getSize(uri, (w, h) => {
        imageNativeSize.current = { width: w, height: h }
      })
    }
  }, [uri])

  // Actual rendered size of the image inside the container (resizeMode: contain)
  function getRenderedSize() {
    const { width: cw, height: ch } = containerSize.current
    const { width: iw, height: ih } = imageNativeSize.current
    if (!iw || !ih || !cw || !ch) return null
    const ratio = Math.min(cw / iw, ch / ih)
    return { width: iw * ratio, height: ih * ratio }
  }

  // Max translation before image edge goes past container edge
  function maxTranslate(s: number) {
    const { width: cw, height: ch } = containerSize.current
    const rendered = getRenderedSize()
    if (!rendered) return { x: 0, y: 0 }
    return {
      x: Math.max(0, (rendered.width * s - cw) / 2),
      y: Math.max(0, (rendered.height * s - ch) / 2),
    }
  }

  function clamp(tx: number, ty: number, s: number) {
    const max = maxTranslate(s)
    return {
      x: Math.min(max.x, Math.max(-max.x, tx)),
      y: Math.min(max.y, Math.max(-max.y, ty)),
    }
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) =>
        e.nativeEvent.touches.length >= 2 || currentScale.current > 1,
      onMoveShouldSetPanResponder: (e) =>
        e.nativeEvent.touches.length >= 2 || currentScale.current > 1,
      onPanResponderGrant: (e) => {
        const t = e.nativeEvent.touches
        if (t.length >= 2) {
          const dx = t[1].pageX - t[0].pageX
          const dy = t[1].pageY - t[0].pageY
          initialDistance.current = Math.sqrt(dx * dx + dy * dy)
        }
        lastTranslate.current = { ...currentTranslate.current }
      },
      onPanResponderMove: (e, gs) => {
        const t = e.nativeEvent.touches
        if (t.length >= 2) {
          const dx = t[1].pageX - t[0].pageX
          const dy = t[1].pageY - t[0].pageY
          const dist = Math.sqrt(dx * dx + dy * dy)
          const s = Math.min(Math.max(lastScale.current * (dist / initialDistance.current), 1), 5)
          currentScale.current = s
          scale.setValue(s)
          const clamped = clamp(currentTranslate.current.x, currentTranslate.current.y, s)
          currentTranslate.current = clamped
          translateX.setValue(clamped.x)
          translateY.setValue(clamped.y)
        } else if (currentScale.current > 1) {
          const clamped = clamp(
            lastTranslate.current.x + gs.dx,
            lastTranslate.current.y + gs.dy,
            currentScale.current,
          )
          currentTranslate.current = clamped
          translateX.setValue(clamped.x)
          translateY.setValue(clamped.y)
        }
      },
      onPanResponderRelease: () => {
        if (currentScale.current <= 1) {
          Animated.parallel([
            Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
          ]).start()
          lastScale.current = 1
          currentScale.current = 1
          currentTranslate.current = { x: 0, y: 0 }
          lastTranslate.current = { x: 0, y: 0 }
        } else {
          lastScale.current = currentScale.current
          lastTranslate.current = { ...currentTranslate.current }
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
      onLayout={(e) => {
        containerSize.current = {
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        }
      }}
      {...panResponder.panHandlers}
    >
      <Animated.Image
        source={{ uri }}
        style={{ flex: 1, resizeMode: 'contain', transform: [{ scale }, { translateX }, { translateY }] }}
      />
    </Animated.View>
  )
}
