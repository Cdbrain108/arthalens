/* Registers the JSX loader for `node --import`.
 *
 * Requires Node 20.6+ (when module.register landed). On Node 18, use the
 * `npm run test:node18` script instead, which passes the hooks file directly
 * via --experimental-loader.
 */
import { register } from 'node:module'

if (typeof register !== 'function') {
  throw new Error(
    'node:module.register is unavailable (Node 20.6+ required). ' +
      'Run `npm run test:node18` instead.'
  )
}

register('./jsx-loader.mjs', import.meta.url)
