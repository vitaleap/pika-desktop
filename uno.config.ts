import { defineConfig, presetIcons, presetWind4, transformerDirectives } from 'unocss'

export default defineConfig({
  transformers: [transformerDirectives()],
  extendTheme: (theme: any) => {
    return { ...theme, breakpoint: { ...theme.breakpoint, xs: '30rem' } }
  },
  presets: [
    presetWind4({
      dark: {
        dark: '[theme-mode="dark"]',
      },
    }),
    // https://yesicon.app/mdi or https://icon-sets.iconify.design/mdi/
    presetIcons({
      warn: true,
      extraProperties: {
        display: 'inline-block',
        'flex-shrink': '0',
      },
    }),
  ],
  shortcuts: {},
})
