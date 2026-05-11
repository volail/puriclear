import { supabase } from './supabase'

export async function getSignedUrl(path: string): Promise<string> {
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
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectPath, 3600)
  if (error || !data?.signedUrl) throw new Error('Failed to get signed URL')
  return data.signedUrl
}

export async function getUploadSignedUrl(uploadId: string): Promise<string> {
  const res = await supabase.functions.invoke('get-upload-url', { body: { upload_id: uploadId } })
  if (res.error) throw res.error
  const url = res.data?.signed_url
  if (typeof url !== 'string') throw new Error('Edge function returned no signed_url')
  return url
}
