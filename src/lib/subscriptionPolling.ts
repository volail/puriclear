import { supabase } from './supabase'

export async function pollForProPlan(
  userId: string,
  timeoutMs = 10000,
  intervalMs = 2000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs))
    const { data } = await supabase
      .from('subscription_status')
      .select('plan')
      .eq('user_id', userId)
      .single()
    if (data?.plan === 'pro') return true
  }
  return false
}
