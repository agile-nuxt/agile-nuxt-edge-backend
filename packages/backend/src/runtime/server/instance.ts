import configSource from '#agile-backend-config'
import { createBackendRuntime, type BackendRuntime } from './factory.js'
import type { BackendModuleOptions } from '../types.js'

interface BackendRuntimeState {
  runtimePromise: Promise<BackendRuntime> | undefined
}

const runtimeStateKey = Symbol.for('@agile-nuxt/backend.runtime')

function getRuntimeState(): BackendRuntimeState {
  const runtimeGlobal = globalThis as unknown as Record<symbol, BackendRuntimeState | undefined>
  runtimeGlobal[runtimeStateKey] ??= { runtimePromise: undefined }
  return runtimeGlobal[runtimeStateKey]
}

export function getBackendRuntime(): Promise<BackendRuntime> {
  const state = getRuntimeState()
  state.runtimePromise ??= createBackendRuntime(configSource as BackendModuleOptions).catch((error) => {
    state.runtimePromise = undefined
    throw error
  })
  return state.runtimePromise
}

export async function closeBackendRuntime(): Promise<void> {
  const state = getRuntimeState()
  if (!state.runtimePromise) return
  const runtime = await state.runtimePromise
  await runtime.db.close()
  state.runtimePromise = undefined
}

export type { BackendRuntime } from './factory.js'
