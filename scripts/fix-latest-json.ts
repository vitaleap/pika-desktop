#!/usr/bin/env bun
/**
 * 修正 tauri-action 生成的 latest.json 里的 url。
 *
 * tauri-action 默认生成 `url: https://api.github.com/repos/.../releases/assets/<id>`，
 * 这个 API 端点在国内受限且容易被 rate limit 误判 403，导致客户端 download 失败。
 *
 * 修正逻辑：
 *   1. 下载 latest.json
 *   2. 从 url 末尾提取 asset id（数字）
 *   3. 用 `gh release view --json assets` 反查 asset id 对应的真实文件名
 *   4. 重写 url 为 `https://github.com/<repo>/releases/download/<tag>/<filename>`
 *   5. 覆盖上传
 *
 * 因为文件名直接从 GitHub 拉，不依赖任何 hardcode 命名约定或 releaseAssetNamePattern。
 *
 * 环境变量：
 *   GITHUB_REF_NAME   tag 名，如 v0.1.9
 *   GITHUB_REPOSITORY 仓库，如 vitaleap/pika-desktop
 *   GH_TOKEN          有 release assets 读写权限的 PAT
 */

const tag = process.env.GITHUB_REF_NAME
const repo = process.env.GITHUB_REPOSITORY
const token = process.env.GH_TOKEN

if (!tag || !repo || !token) {
  console.error('[fix-latest-json] missing GITHUB_REF_NAME / GITHUB_REPOSITORY / GH_TOKEN')
  process.exit(1)
}

const env = { ...process.env, GH_TOKEN: token } as Record<string, string>

async function gh(args: string[]): Promise<string> {
  const proc = Bun.spawn({
    cmd: ['gh', ...args],
    env,
    stdout: 'pipe',
    stderr: 'inherit',
  })
  const out = await new Response(proc.stdout).text()
  const code = await proc.exited
  if (code !== 0) process.exit(code)
  return out
}

// 1. 下载 latest.json
await gh(['release', 'download', tag, '--pattern', 'latest.json', '--clobber', '--dir', 'out'])

// 2. 拉取 asset id → filename 映射
//    apiUrl 字段是 REST API URL，末尾的数字才是真正的 asset ID；
//    id 字段是 GraphQL 全局 ID（RA_kwD...），跟 url 里数字 ID 不匹配
const assetsRaw = await gh([
  'release',
  'view',
  tag,
  '--json',
  'assets',
  '--jq',
  '.assets | map(select(.name | endswith(".sig") | not)) ' +
    '| map({id: (.apiUrl | capture("/assets/(?<n>[0-9]+)$").n), name})',
])
const assets: { id: string; name: string }[] = JSON.parse(assetsRaw)
const idToName = new Map(assets.map((a) => [a.id, a.name]))
console.log(`[fix-latest-json] found ${assets.length} assets in release ${tag}`)

// 3. 重写 latest.json 的 url 字段
const latestPath = 'out/latest.json'
type Platform = { url: string; signature: string }
const latest = (await Bun.file(latestPath).json()) as {
  version: string
  platforms: Record<string, Platform>
}
const base = `https://github.com/${repo}/releases/download/${tag}`
let rewritten = 0

for (const [key, plat] of Object.entries(latest.platforms)) {
  const m = plat.url.match(/\/assets\/(\d+)/)
  if (!m) continue
  const fname = idToName.get(m[1])
  if (!fname) {
    console.warn(`[skip] ${key}: unknown asset id ${m[1]}`)
    continue
  }
  const newUrl = `${base}/${fname}`
  if (newUrl !== plat.url) {
    console.log(`[rewrite] ${key}`)
    console.log(`          old: ${plat.url}`)
    console.log(`          new: ${newUrl}`)
    plat.url = newUrl
    rewritten++
  }
}

await Bun.write(latestPath, JSON.stringify(latest, null, 2) + '\n')

// 4. 覆盖上传
await gh(['release', 'upload', tag, latestPath, '--clobber'])

console.log(`[fix-latest-json] done: rewrote ${rewritten} url(s)`)
