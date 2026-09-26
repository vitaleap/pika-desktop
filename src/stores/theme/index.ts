import { defineStore } from 'pinia'
import useTheme from './use-theme'
import { useStorage } from '@/utils/storage'

type SystemTheme = 'light' | 'dark'
export type ThemeMode = SystemTheme | 'system'

export const useThemeStore = defineStore('theme', () => {
  const systemTheme = useStorage<SystemTheme>(`systemTheme`, 'light')
  const themeMode = useStorage<ThemeMode>(`themeMode`, 'system')

  const isDark = computed(() => {
    if (themeMode.value === 'system') {
      return systemTheme.value === 'dark'
    }
    return themeMode.value === 'dark'
  })

  const setTheme = (theme: ThemeMode) => {
    themeMode.value = theme
  }
  let isInit = false
  const init = () => {
    if (isInit) {
      return
    }
    isInit = true
    const { isDarkMode } = useTheme((isDark: boolean) => {
      systemTheme.value = isDark ? 'dark' : 'light'
    })
    systemTheme.value = isDarkMode() ? 'dark' : 'light'
  }

  return { themeMode, systemTheme, isDark, setTheme, init }
})
