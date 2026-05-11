import React from 'react'
import { renderHook, act } from '@testing-library/react-native'
import { AuthProvider, useAuth } from '../src/contexts/AuthContext'

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}))

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
)

test('starts with null session', async () => {
  const { result } = renderHook(() => useAuth(), { wrapper })
  await act(async () => {})
  expect(result.current.session).toBeNull()
})

test('isLoading becomes false after session check', async () => {
  const { result } = renderHook(() => useAuth(), { wrapper })
  await act(async () => {})
  expect(result.current.isLoading).toBe(false)
})
