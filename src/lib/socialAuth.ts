import { Platform } from 'react-native'
import { supabase } from './supabase'
import * as AppleAuth from 'expo-apple-authentication'
import { GoogleSignin } from '@react-native-google-signin/google-signin'

export async function signInWithApple(): Promise<void> {
  if (Platform.OS === 'web') {
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: typeof window !== 'undefined' ? window.location.origin + '/' : undefined },
    })
    return
  }
  const credential = await AppleAuth.signInAsync({
    requestedScopes: [
      AppleAuth.AppleAuthenticationScope.FULL_NAME,
      AppleAuth.AppleAuthenticationScope.EMAIL,
    ],
  })
  if (!credential.identityToken) throw new Error('No Apple identity token')
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
  await GoogleSignin.signIn()
  const { idToken } = await GoogleSignin.getTokens()
  if (!idToken) throw new Error('No Google id token')
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  })
  if (error) throw error
}
