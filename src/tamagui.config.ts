import { createTamagui } from '@tamagui/core'
import { config as tamaguiConfig } from '@tamagui/config/v3'

const config = createTamagui({
  ...tamaguiConfig,
  tokens: {
    ...tamaguiConfig.tokens,
    color: {
      ...tamaguiConfig.tokens.color,
      pink: '#FFB7C5',
      lavender: '#C8B4E8',
      cream: '#FFF9FB',
      grey: '#F2EEF5',
    },
  },
})

export type AppConfig = typeof config
declare module '@tamagui/core' {
  interface TamaguiCustomConfig extends AppConfig {}
}

export default config
