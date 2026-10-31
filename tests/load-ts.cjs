const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const vm = require('node:vm')
module.exports = function createLoader({ overrides = {}, globals = {} } = {}) {
  const cache = new Map()
  function load(file) {
    file = path.resolve(file)
    const relative = path.relative(process.cwd(), file)
    if (Object.hasOwn(overrides, relative)) return overrides[relative]
    if (cache.has(file)) return cache.get(file)
    const exports = {}
    cache.set(file, exports)
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
    const requireModule = name => {
      if (Object.hasOwn(overrides, name)) return overrides[name]
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`)
      if (name.startsWith('.')) return load(path.resolve(path.dirname(file), `${name}.ts`))
      return require(name)
    }
    vm.runInNewContext(code, { exports, require: requireModule, Response, Request, FormData, File, URL, URLSearchParams, AbortSignal, Buffer, setTimeout, clearTimeout, process, console, fetch, ...globals }, { filename: file })
    return exports
  }
  return load
}
