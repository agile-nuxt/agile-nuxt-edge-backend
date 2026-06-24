import { EdgeDbError } from './errors.js'

const SERVERLESS_ENV_KEYS = [
  'AWS_LAMBDA_FUNCTION_NAME',
  'VERCEL',
  'NETLIFY',
  'CF_PAGES',
  'DENO_DEPLOYMENT_ID'
] as const

export interface EnvironmentInfo {
  nodeVersion: string
  platform: NodeJS.Platform
  serverlessSignals: string[]
}

export function inspectEnvironment(): EnvironmentInfo {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    serverlessSignals: SERVERLESS_ENV_KEYS.filter((key) => Boolean(process.env[key]))
  }
}

export function assertSupportedEnvironment(readOnly: boolean): EnvironmentInfo {
  const info = inspectEnvironment()
  if (!process.versions.node) {
    throw new EdgeDbError(
      'ENVIRONMENT_UNSUPPORTED',
      'edge-db requires the Node.js runtime and a persistent filesystem.'
    )
  }
  if (!readOnly && info.serverlessSignals.length > 0) {
    throw new EdgeDbError(
      'ENVIRONMENT_UNSUPPORTED',
      `Writable edge-db cannot run in an ephemeral serverless or edge environment (${info.serverlessSignals.join(', ')}). Use a persistent Node server or readOnly mode.`,
      { signals: info.serverlessSignals }
    )
  }
  return info
}
