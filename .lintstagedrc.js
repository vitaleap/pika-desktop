export default {
  '*.{js,jsx,ts,tsx,vue,md,json,yml,yaml}': ['prettier --write'],
  'src-tauri/**/*.rs': [() => 'bun run lint:rust-fmt', () => 'bun run check:rust-clippy'],
  'src/**/*.{ts,tsx,vue}': [() => 'bun run check:type'],
}
