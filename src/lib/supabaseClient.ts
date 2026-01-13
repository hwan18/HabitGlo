import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const hasSupabase = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase: SupabaseClient | null = hasSupabase
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null

export const getCurrentUser = async (): Promise<User | null> => {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}
