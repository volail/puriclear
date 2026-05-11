import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { signInWithApple, signInWithGoogle } from '../../src/lib/socialAuth'

export default function Login() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)

  async function handleApple() {
    try {
      setLoading(true)
      await signInWithApple()
    } catch (err: any) {
      Alert.alert(t('errors.authFailed'), err?.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    try {
      setLoading(true)
      await signInWithGoogle()
    } catch (err: any) {
      Alert.alert(t('errors.authFailed'), err?.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.appName}>{t('common.appName')}</Text>
      <Text style={styles.subtitle}>{t('login.subtitle')}</Text>

      <View style={styles.buttons}>
        {Platform.OS !== 'android' && (
          <TouchableOpacity
            onPress={handleApple}
            disabled={loading}
            style={[styles.button, styles.appleButton]}
          >
            <Text style={styles.appleButtonText}>{t('login.appleSignIn')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handleGoogle}
          disabled={loading}
          style={[styles.button, styles.googleButton]}
        >
          <Text style={styles.googleButtonText}>{t('login.googleSignIn')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF9FB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 24,
  },
  appName: {
    fontSize: 36,
    fontWeight: '700',
    color: '#C8B4E8',
  },
  subtitle: {
    fontSize: 16,
    color: '#2D2D2D',
    opacity: 0.7,
  },
  buttons: {
    width: '100%',
    gap: 12,
    marginTop: 16,
  },
  button: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleButton: {
    backgroundColor: '#000',
  },
  appleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  googleButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8DFF0',
  },
  googleButtonText: {
    color: '#2D2D2D',
    fontSize: 16,
    fontWeight: '600',
  },
})
