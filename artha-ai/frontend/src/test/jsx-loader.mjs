/* Node module-customization hooks so `node --test` can import the app's .jsx
 * components directly.
 *
 * Uses esbuild, which is already present as a Vite dependency — no new package
 * is installed. Two hooks are needed:
 *
 *   resolve — the app imports extensionless specifiers ('./Logo'), which Vite
 *             resolves but Node ESM does not.
 *   load    — transforms .jsx with the automatic JSX runtime, and stubs .css
 *             so a stylesheet import cannot break a test run.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { transform } from 'esbuild'

const EXTENSIONS = ['.jsx', '.js', '/index.jsx', '/index.js']

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    try {
      return await nextResolve(specifier, context)
    } catch (err) {
      for (const ext of EXTENSIONS) {
        try {
          return await nextResolve(specifier + ext, context)
        } catch {
          // try the next candidate extension
        }
      }
      throw err
    }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.css')) {
    return { format: 'module', source: 'export default {}', shortCircuit: true }
  }

  if (url.endsWith('.jsx')) {
    const source = await readFile(fileURLToPath(url), 'utf8')
    const { code } = await transform(source, {
      loader: 'jsx',
      format: 'esm',
      target: 'node18',
      jsx: 'automatic',
      sourcefile: url
    })
    return { format: 'module', source: code, shortCircuit: true }
  }

  return nextLoad(url, context)
}
