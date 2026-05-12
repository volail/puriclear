import { Platform, Image as RNImage } from 'react-native'
import * as FileSystem from 'expo-file-system'
import { supabase } from './supabase'

const MAX_INPUT_DIM = 800

type ProcessResult = { uploadId: string; signedUrl: string }

export async function invokeProcessImage(uri: string, mimeType: string): Promise<ProcessResult> {
  let base64: string
  let finalMimeType = mimeType

  if (Platform.OS === 'web') {
    const response = await fetch(uri)
    if (!response.ok) throw new Error('FETCH_FAILED')
    const blob = await response.blob()
    const resized = await resizeBlob(blob, MAX_INPUT_DIM)
    base64 = await blobToBase64(resized.blob)
    finalMimeType = resized.mimeType
  } else {
    const resized = await resizeMobile(uri, mimeType, MAX_INPUT_DIM)
    base64 = await FileSystem.readAsStringAsync(resized.uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
    finalMimeType = resized.mimeType
  }

  const { data, error } = await supabase.functions.invoke('process-image', {
    body: { imageBase64: base64, mimeType: finalMimeType },
  })

  if (error) {
    let detail = error.message ?? 'PROCESSING_FAILED'
    try {
      const body = await (error as any).context?.json?.()
      if (body?.error) detail = body.error
    } catch {}
    console.error('[processImage] function error:', detail)
    throw new Error(detail)
  }
  if (!data?.uploadId || !data?.signedUrl) throw new Error('PROCESSING_FAILED')
  return data as ProcessResult
}

async function resizeBlob(blob: Blob, maxDim: number): Promise<{ blob: Blob; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { naturalWidth: w, naturalHeight: h } = img
      if (Math.max(w, h) <= maxDim) {
        resolve({ blob, mimeType: 'image/jpeg' })
        return
      }
      const scale = maxDim / Math.max(w, h)
      const tw = Math.round(w * scale)
      const th = Math.round(h * scale)
      const canvas = document.createElement('canvas')
      canvas.width = tw
      canvas.height = th
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, tw, th)
      canvas.toBlob(
        b => {
          if (!b) { reject(new Error('Canvas resize failed')); return }
          resolve({ blob: b, mimeType: 'image/jpeg' })
        },
        'image/jpeg',
        0.92,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
    img.src = url
  })
}

async function resizeMobile(uri: string, mimeType: string, maxDim: number): Promise<{ uri: string; mimeType: string }> {
  const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    RNImage.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject)
  })

  if (Math.max(dims.width, dims.height) <= maxDim) {
    return { uri, mimeType }
  }

  const scale = maxDim / Math.max(dims.width, dims.height)
  const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator')
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: Math.round(dims.width * scale), height: Math.round(dims.height * scale) } }],
    { compress: 0.92, format: SaveFormat.JPEG },
  )
  return { uri: result.uri, mimeType: 'image/jpeg' }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result !== 'string') { reject(new Error('FETCH_FAILED')); return }
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
