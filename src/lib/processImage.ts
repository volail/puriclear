import { supabase } from './supabase'

type ProcessResult = { upload_id: string; signed_url: string }

export async function invokeProcessImage(uri: string, mimeType: string): Promise<ProcessResult> {
  const response = await fetch(uri)
  const blob = await response.blob()
  const base64 = await blobToBase64(blob)

  const { data, error } = await supabase.functions.invoke('process-image', {
    body: { image_base64: base64, mime_type: mimeType },
  })

  if (error) throw new Error(error.message ?? 'PROCESSING_FAILED')
  if (!data?.upload_id || !data?.signed_url) throw new Error('PROCESSING_FAILED')
  return data as ProcessResult
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
