import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system'
import { supabase } from './supabase'

type ProcessResult = { uploadId: string; signedUrl: string }

export async function invokeProcessImage(uri: string, mimeType: string): Promise<ProcessResult> {
  let base64: string
  if (Platform.OS === 'web') {
    const response = await fetch(uri)
    if (!response.ok) throw new Error('FETCH_FAILED')
    const blob = await response.blob()
    base64 = await blobToBase64(blob)
  } else {
    base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
  }

  const { data, error } = await supabase.functions.invoke('process-image', {
    body: { imageBase64: base64, mimeType },
  })

  if (error) {
    let detail = error.message ?? 'PROCESSING_FAILED'
    try {
      // FunctionsHttpError exposes the raw response on .context
      const body = await (error as any).context?.json?.()
      if (body?.error) detail = body.error
    } catch {}
    console.error('[processImage] function error:', detail)
    throw new Error(detail)
  }
  if (!data?.uploadId || !data?.signedUrl) throw new Error('PROCESSING_FAILED')
  return data as ProcessResult
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
