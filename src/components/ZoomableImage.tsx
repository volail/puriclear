import React, { useEffect, useRef, useState } from 'react'
import { Animated, Image, PanResponder, Platform, View } from 'react-native'

interface Props {
  uri: string
  style?: object
}

// ─── Web ─────────────────────────────────────────────────────────────────────

function WebZoomableImage({ uri, style }: Props) {
  const [transform, setTransform] = useState({ s: 1, x: 0, y: 0 })
  const t = useRef({ s: 1, x: 0, y: 0 })
  const containerRef = useRef<any>(null)
  const imageNativeSize = useRef({ width: 0, height: 0 })
  const isDragging = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, tx: 0, ty: 0 })

  useEffect(() => {
    Image.getSize(uri, (w, h) => { imageNativeSize.current = { width: w, height: h } })
  }, [uri])

  function computeMaxTranslate(s: number) {
    const el = containerRef.current
    if (!el) return { x: 0, y: 0 }
    const cw = el.offsetWidth as number
    const ch = el.offsetHeight as number
    const { width: iw, height: ih } = imageNativeSize.current
    let rw = cw, rh = ch
    if (iw > 0 && ih > 0) {
      const ratio = Math.min(cw / iw, ch / ih)
      rw = iw * ratio
      rh = ih * ratio
    }
    return {
      x: Math.max(0, (rw * s - cw) / 2),
      y: Math.max(0, (rh * s - ch) / 2),
    }
  }

  function clamp(x: number, y: number, s: number) {
    const max = computeMaxTranslate(s)
    return {
      x: Math.min(max.x, Math.max(-max.x, x)),
      y: Math.min(max.y, Math.max(-max.y, y)),
    }
  }

  function handleWheel(e: any) {
    e.preventDefault()
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const { s, x, y } = t.current

    const factor = e.deltaY < 0 ? 1.05 : 1 / 1.05
    const newS = Math.min(Math.max(s * factor, 1), 5)

    // Mouse position relative to container center
    const mx = e.clientX - rect.left - rect.width / 2
    const my = e.clientY - rect.top - rect.height / 2

    // Keep the point under the cursor fixed
    const contentX = (mx - x) / s
    const contentY = (my - y) / s
    const rawX = mx - contentX * newS
    const rawY = my - contentY * newS

    const clamped = clamp(rawX, rawY, newS)
    t.current = { s: newS, ...clamped }
    setTransform({ s: newS, ...clamped })
  }

  function handleMouseDown(e: any) {
    if (t.current.s <= 1) return
    isDragging.current = true
    dragStart.current = { mx: e.clientX, my: e.clientY, tx: t.current.x, ty: t.current.y }
  }

  function handleMouseMove(e: any) {
    if (!isDragging.current) return
    const { mx, my, tx, ty } = dragStart.current
    const clamped = clamp(tx + (e.clientX - mx), ty + (e.clientY - my), t.current.s)
    t.current = { ...t.current, ...clamped }
    setTransform({ ...t.current })
  }

  function handleMouseUp() {
    isDragging.current = false
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  const cursor = transform.s > 1 ? (isDragging.current ? 'grabbing' : 'grab') : 'default'

  return (
    <View
      ref={containerRef}
      style={[{ flex: 1, overflow: 'hidden' } as any, style]}
      onMouseDown={handleMouseDown as any}
      onMouseMove={handleMouseMove as any}
      onMouseUp={handleMouseUp as any}
      onMouseLeave={handleMouseUp as any}
    >
      <Image
        source={{ uri }}
        style={[
          { flex: 1, resizeMode: 'contain' } as any,
          {
            transform: [{ scale: transform.s }, { translateX: transform.x }, { translateY: transform.y }],
            cursor,
            userSelect: 'none',
          },
        ]}
      />
    </View>
  )
}

// ─── Native ───────────────────────────────────────────────────────────────────

function NativeZoomableImage({ uri, style }: Props) {
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
    Image.getSize(uri, (w, h) => { imageNativeSize.current = { width: w, height: h } })
  }, [uri])

  function getRenderedSize() {
    const { width: cw, height: ch } = containerSize.current
    const { width: iw, height: ih } = imageNativeSize.current
    if (!iw || !ih || !cw || !ch) return null
    const ratio = Math.min(cw / iw, ch / ih)
    return { width: iw * ratio, height: ih * ratio }
  }

  function clamp(tx: number, ty: number, s: number) {
    const { width: cw, height: ch } = containerSize.current
    const rendered = getRenderedSize()
    if (!rendered) return { x: 0, y: 0 }
    const maxX = Math.max(0, (rendered.width * s - cw) / 2)
    const maxY = Math.max(0, (rendered.height * s - ch) / 2)
    return {
      x: Math.min(maxX, Math.max(-maxX, tx)),
      y: Math.min(maxY, Math.max(-maxY, ty)),
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

// ─── Export ───────────────────────────────────────────────────────────────────

export function ZoomableImage(props: Props) {
  return Platform.OS === 'web' ? <WebZoomableImage {...props} /> : <NativeZoomableImage {...props} />
}
