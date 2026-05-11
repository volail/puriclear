import { pollForProPlan } from '../src/lib/subscriptionPolling'

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn()
        .mockResolvedValueOnce({ data: { plan: 'free' }, error: null })
        .mockResolvedValueOnce({ data: { plan: 'free' }, error: null })
        .mockResolvedValueOnce({ data: { plan: 'pro' }, error: null }),
    }),
  },
}))

test('pollForProPlan resolves true when plan becomes pro', async () => {
  jest.useFakeTimers()
  const promise = pollForProPlan('uid', 10000, 100)
  await jest.runAllTimersAsync()
  const result = await promise
  expect(result).toBe(true)
  jest.useRealTimers()
})
