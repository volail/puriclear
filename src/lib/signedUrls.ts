import { supabase } from './supabase'

export async function getSignedUrl(path: string, thumbWidth?: number): Promise<string> {
  if (path.startsWith('https://') || path.startsWith('http://')) {
    return path
  }
  const isUpscaled = path.startsWith('upscaled/')
  const bucket = isUpscaled ? 'upscaled' : 'originals'
  const objectPath = isUpscaled
    ? path.slice('upscaled/'.length)
    : path.startsWith('originals/')
    ? path.slice('originals/'.length)
    : path
  const transform = thumbWidth ? { width: thumbWidth, resize: 'contain' as const } : undefined
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectPath, 3600, { transform })
  if (error || !data?.signedUrl) throw new Error('Failed to get signed URL')
  return data.signedUrl
}

export async function getUploadSignedUrl(uploadId: string): Promise<string> {
  const res = await supabase.functions.invoke(`get-upload-url?uploadId=${encodeURIComponent(uploadId)}`)
  if (res.error) throw res.error
  const url = res.data?.signedUrl
  if (typeof url !== 'string') throw new Error('Edge function returned no signedUrl')
  return url
}
