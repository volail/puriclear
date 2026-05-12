import React, { useRef, useState } from 'react'
import { Animated, Image, LayoutChangeEvent, PanResponder, Text, View } from 'react-native'

interface Props {
  beforeUri: string
  afterUri: string
  beforeLabel?: string
  afterLabel?: string
}

export function BeforeAfterSlider({ beforeUri, afterUri, beforeLabel = 'BEFORE', afterLabel = 'AI' }: Props) {
  const [containerWidth, setContainerWidth] = useState(0)
  const containerWidthRef = useRef(0)
  const dividerX = useRef(new Animated.Value(0)).current
  const currentDivX = useRef(0)
  const gestureStartX = useRef(0)

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        gestureStartX.current = currentDivX.current
      },
      onPanResponderMove: (_, gs) => {
        const w = containerWidthRef.current
        if (w === 0) return
        const newX = Math.min(Math.max(gestureStartX.current + gs.dx, 0), w)
        currentDivX.current = newX
        dividerX.setValue(newX)
      },
    })
  ).current

  function handleLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width
    containerWidthRef.current = w
    setContainerWidth(w)
    const half = w * 0.5
    dividerX.setValue(half)
    currentDivX.current = half
  }

  return (
    <View style={{ flex: 1 }} onLayout={handleLayout}>
      {containerWidth > 0 && (
        <>
          {/* Before image — full size, always visible underneath */}
          <Image
            source={{ uri: beforeUri }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, resizeMode: 'contain' }}
          />

          {/* After image — clipped to left of divider */}
          <Animated.View
            style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: dividerX, overflow: 'hidden' }}
          >
            <Image
              source={{ uri: afterUri }}
              style={{ width: containerWidth, position: 'absolute', top: 0, bottom: 0, left: 0, resizeMode: 'contain' }}
            />
          </Animated.View>

          {/* Divider line */}
          <Animated.View
            style={{ position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, left: dividerX, backgroundColor: 'white', zIndex: 10 }}
          />

          {/* Drag handle */}
          <Animated.View
            style={{
              position: 'absolute', top: '50%', marginTop: -24, marginLeft: -24,
              left: dividerX, width: 48, height: 48,
              borderRadius: 24, backgroundColor: 'white',
              alignItems: 'center', justifyContent: 'center',
              shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
              elevation: 6, zIndex: 11,
            }}
            {...panResponder.panHandlers}
          >
            <Text style={{ fontSize: 16, color: '#555', letterSpacing: -2 }}>{'◀▶'}</Text>
          </Animated.View>

          {/* Labels */}
          <Animated.View style={{ position: 'absolute', top: 12, left: 12, zIndex: 5 }}>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
              <Text style={{ color: 'white', fontSize: 11, fontWeight: '600', letterSpacing: 1 }}>{beforeLabel}</Text>
            </View>
          </Animated.View>
          <Animated.View style={{ position: 'absolute', top: 12, right: 12, zIndex: 5 }}>
            <View style={{ backgroundColor: 'rgba(200,180,232,0.8)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
              <Text style={{ color: 'white', fontSize: 11, fontWeight: '600', letterSpacing: 1 }}>{afterLabel}</Text>
            </View>
          </Animated.View>
        </>
      )}
    </View>
  )
}
