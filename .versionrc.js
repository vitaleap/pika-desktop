/**
 * @typedef {object} CommitType
 * @property {string} type
 * @property {string} [section]
 * @property {boolean} [hidden]
 */

/**
 * @typedef {object} BumpFile
 * @property {string} filename      文件名
 * @property {'json'|'python'} type 类型
 */

/**
 * @typedef {object} Scripts
 * @property {string} [prebump]
 * @property {string} [postbump]
 */

/**
 * @typedef {object} Config
 * @property {CommitType[]} [types] 类型
 * @property {BumpFile[]} [bumpFiles] bump版本文件
 * @property {boolean} [commitAll] 提交暂存信息
 * @property {Scripts} [scripts] hook脚本
 */

/** @type {Config} */
export default {
  types: [
    { type: 'feat', section: '🎉 Features' },
    { type: 'fix', section: '🐛 Bug Fixes' },
    { type: 'refactor', section: '♻️ Refactors' },
    { type: 'perf', section: '🚀 Improve performance' },
    { type: 'chore', hidden: true },
    { type: 'docs', hidden: true },
    { type: 'style', hidden: true },
    { type: 'test', hidden: true },
    { type: 'build', hidden: true },
  ],
  bumpFiles: [
    { filename: 'package.json', type: 'json' },
    { filename: 'src-tauri/tauri.conf.json', type: 'json' },
    { filename: 'src-tauri/Cargo.toml', type: 'python' },
  ],
  commitAll: true,
  scripts: {
    prebump:
      "# 请确保暂存文件都已提交\nbun -e \"process.exit(Bun.spawnSync(['git','status','--porcelain']).stdout.byteLength)\"",
    postbump: 'cargo check --manifest-path src-tauri/Cargo.toml && git add src-tauri/Cargo.lock',
  },
}
