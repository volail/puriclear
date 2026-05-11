import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const PAGE_SIZE = 30

export type UploadRow = {
  id: string
  upscaled_path: string
  created_at: string
  status: string
}

export function useGallery() {
  const { session } = useAuth()
  const [uploads, setUploads] = useState<UploadRow[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(0)

  const fetchPage = useCallback(async (pageNum: number, reset = false) => {
    if (!session?.user?.id) return
    setLoading(true)
    const from = pageNum * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await supabase
      .from('uploads')
      .select('id, upscaled_path, created_at, status')
      .eq('user_id', session.user.id)
      .eq('status', 'done')
      .order('created_at', { ascending: false })
      .range(from, to)

    if (!error && data) {
      setUploads(prev => reset ? data : [...prev, ...data])
      setHasMore(data.length === PAGE_SIZE)
    }
    setLoading(false)
  }, [session?.user?.id])

  const refresh = useCallback(async () => {
    setPage(0)
    setHasMore(true)
    await fetchPage(0, true)
  }, [fetchPage])

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return
    const next = page + 1
    setPage(next)
    await fetchPage(next)
  }, [loading, hasMore, page, fetchPage])

  return { uploads, loading, hasMore, refresh, loadMore }
}
