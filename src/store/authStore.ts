import { invoke } from '@tauri-apps/api/core'
import { create } from 'zustand'

type AuthState = {
  initializing: boolean
  loading: boolean
  accessToken: string | null
  error: string | null
  checkSaved: () => Promise<void>
  login: () => Promise<void>
  cancel: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  initializing: true,
  loading: false,
  accessToken: null,
  error: null,
  checkSaved: async () => {
    set({ initializing: true, error: null })
    try {
      const token = await invoke<string | null>('check_saved_auth')
      set({ accessToken: token })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ initializing: false })
    }
  },
  login: async () => {
    set({ loading: true, error: null, accessToken: null })
    try {
      const token = await invoke<string>('get_access_token')
      set({ accessToken: token })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ loading: false })
    }
  },
  cancel: async () => {
    try {
      set({ loading: true, error: null })
      await invoke('cancel_auth')
      set({ accessToken: null })
    } catch (e) {
      console.warn('Cancel auth failed:', e)
    } finally {
      set({ loading: false })
    }
  },
}))
