import { signInWithApple, signInWithGoogle } from '../src/lib/socialAuth'

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithIdToken: jest.fn().mockResolvedValue({ data: { session: {} }, error: null }),
      signInWithOAuth: jest.fn().mockResolvedValue({ data: {}, error: null }),
    },
  },
}))

// expo-apple-authentication is already mocked in __mocks__/
// @react-native-google-signin/google-signin is already mocked in __mocks__/

// jest-expo runs with platform 'ios' by default; no need to mock Platform

test('signInWithApple calls signInWithIdToken with apple token', async () => {
  const { supabase } = require('../src/lib/supabase')
  await signInWithApple()
  expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith(
    expect.objectContaining({ provider: 'apple', token: 'mock-apple-token' })
  )
})

test('signInWithGoogle calls signInWithIdToken with google token', async () => {
  const { supabase } = require('../src/lib/supabase')
  await signInWithGoogle()
  expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith(
    expect.objectContaining({ provider: 'google', token: 'mock-google-token' })
  )
})
