<template>
  <n-config-provider
    :theme="themeConfig.theme"
    :theme-overrides="themeConfig.themeOverrides"
    class="h-full w-full"
  >
    <n-loading-bar-provider>
      <n-message-provider>
        <n-notification-provider>
          <n-dialog-provider>
            <router-view />
          </n-dialog-provider>
        </n-notification-provider>
      </n-message-provider>
    </n-loading-bar-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { createDiscreteApi, darkTheme, lightTheme, type ConfigProviderProps } from 'naive-ui'
import { toMerged } from 'es-toolkit'

const themeStore = useThemeStore()
themeStore.init()

// 全局右键守卫：仅放行选中文本与带 href 的链接
useContextMenuGuard().enable()

watch(
  () => themeStore.isDark,
  (val) => {
    if (val) {
      document.documentElement.setAttribute('theme-mode', 'dark')
    } else {
      document.documentElement.removeAttribute('theme-mode')
    }
  },
  { immediate: true },
)

const sizeConfig: ConfigProviderProps = {
  themeOverrides: {
    Button: {
      borderRadiusMedium: '8px',
      borderRadiusSmall: '6px',
      // heightSmall: '26px',
      // fontSizeSmall: '12px',
      // fontSizeTiny: '11px',
    },
    Input: {
      borderRadius: '6px',
    },
    Card: {
      borderRadius: '8px',
      paddingMedium: '16px',
    },
    Dropdown: {
      borderRadius: '6px',
    },
    Form: {
      feedbackFontSizeMedium: '11px',
      labelFontSizeLeftMedium: '12px',
      labelFontSizeTopMedium: '12px',
    },
  },
}
const themeConfig = computed<ConfigProviderProps>(() => {
  // update 页面固定使用深色主题，贴合截图样式
  const isDark = themeStore.isDark
  const primaryColor = isDark ? '#3C7EFF' : '#165DFF'
  const primaryColorHover = isDark ? '#306FFF' : '#4080FF'
  const primaryColorPressed = isDark ? '#689FFF' : '#0E42D2'

  return toMerged(
    {
      theme: isDark ? darkTheme : lightTheme,
      themeOverrides: {
        common: {
          primaryColor: primaryColor,
          primaryColorHover: primaryColorHover,
          primaryColorPressed: primaryColorPressed,
          primaryColorSuppl: primaryColorHover,
        },
        Layout: {
          color: isDark ? undefined : '#fcfcfc',
        },
        Tabs: {
          tabTextColorActiveSegment: primaryColor,
          tabTextColorHoverSegment: primaryColorHover,
        },
        Button: {
          waveOpacity: 0,
        },
        Input: {
          color: isDark ? 'rgba(255, 255, 255, .08)' : 'rgba(46, 51, 56, .05)',
          border: 'rgba(0,0,0,0)',
          borderHover: 'rgba(0,0,0,0)',
          colorHover: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(46,51,56,0.09)',
        },
        Switch: {
          boxShadowFocus: 'unset',
        },
      },
    } as ConfigProviderProps,
    sizeConfig,
  )
})

onMounted(async () => {
  const { message, notification, loadingBar } = createDiscreteApi(
    ['message', 'notification', 'loadingBar'],
    // 传 ref 让 discrete API 跟随主题切换响应式更新
    { configProviderProps: themeConfig },
  )
  window.$message = message
  window.$notification = notification
  window.$loadingBar = loadingBar
})
</script>

<style>
:root {
  font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 24px;
  font-weight: 400;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%;
}

html {
  --n-primary-color: #165dff;
  --n-bg-color: #fff;
  color: #0f0f0f;
  background-color: #f6f6f6;
}

html[theme-mode='dark'] {
  --n-primary-color: #3c7eff;
  --n-bg-color: #18181c;
  color: #f6f6f6;
  background-color: #2f2f2f;
}
</style>
