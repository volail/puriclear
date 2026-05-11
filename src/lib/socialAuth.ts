import { Platform } from 'react-native'
import { supabase } from './supabase'
import * as AppleAuth from 'expo-apple-authentication'
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin'

export async function signInWithApple(): Promise<void> {
  if (Platform.OS === 'web') {
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: typeof window !== 'undefined' ? window.location.origin + '/' : undefined },
    })
    return
  }
  let credential: Awaited<ReturnType<typeof AppleAuth.signInAsync>> | null = null
  try {
    credential = await AppleAuth.signInAsync({
      requestedScopes: [
        AppleAuth.AppleAuthenticationScope.FULL_NAME,
        AppleAuth.AppleAuthenticationScope.EMAIL,
      ],
    })
  } catch (err: any) {
    if (err?.code === '1001' || err?.code === 'ERR_REQUEST_CANCELED') return
    throw err
  }
  if (!credential?.identityToken) throw new Error('No Apple identity token')
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  })
  if (error) throw error
}

export async function signInWithGoogle(): Promise<void> {
  if (Platform.OS === 'web') {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: typeof window !== 'undefined' ? window.location.origin + '/' : undefined },
    })
    return
  }
  GoogleSignin.configure({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  })
  await GoogleSignin.hasPlayServices()
  try {
    await GoogleSignin.signIn()
  } catch (err: any) {
    if (err?.code === statusCodes.SIGN_IN_CANCELLED) return
    throw err
  }
  const { idToken } = await GoogleSignin.getTokens()
  if (!idToken) throw new Error('No Google id token')
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  })
  if (error) throw error
}
