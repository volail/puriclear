import { supabase } from './supabase'

export async function getSignedUrl(path: string): Promise<string> {
  const bucket = path.startsWith('upscaled/') ? 'upscaled' : 'originals'
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)
  if (error || !data?.signedUrl) throw new Error('Failed to get signed URL')
  return data.signedUrl
}

export async function getUploadSignedUrl(uploadId: string): Promise<string> {
  const res = await supabase.functions.invoke('get-upload-url', { body: { upload_id: uploadId } })
  if (res.error) throw res.error
  return res.data.signed_url as string
}
