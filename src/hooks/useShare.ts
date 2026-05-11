import { Platform } from 'react-native'
import * as Sharing from 'expo-sharing'

export function useShare() {
  async function shareUrl(url: string): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ url })
      } else if (typeof window !== 'undefined') {
        window.open(url, '_blank')
      }
      return
    }
    const isAvailable = await Sharing.isAvailableAsync()
    if (isAvailable) await Sharing.shareAsync(url)
  }

  return { shareUrl }
}
