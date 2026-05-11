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

test('signInWithApple throws when identityToken is null', async () => {
  const { signInAsync } = require('expo-apple-authentication')
  signInAsync.mockResolvedValueOnce({ identityToken: null })
  await expect(signInWithApple()).rejects.toThrow('No Apple identity token')
})

test('signInWithApple returns silently on user cancellation', async () => {
  const { signInAsync } = require('expo-apple-authentication')
  signInAsync.mockRejectedValueOnce({ code: '1001' })
  await expect(signInWithApple()).resolves.toBeUndefined()
})

test('signInWithGoogle returns silently on user cancellation', async () => {
  const { GoogleSignin, statusCodes } = require('@react-native-google-signin/google-signin')
  GoogleSignin.signIn.mockRejectedValueOnce({ code: statusCodes.SIGN_IN_CANCELLED })
  await expect(signInWithGoogle()).resolves.toBeUndefined()
})
