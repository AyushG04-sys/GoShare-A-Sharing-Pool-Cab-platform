import { createClient } from '@supabase/supabase-js';
import config from './env.js';

let supabaseAdmin = null;

export function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;

  const url = config.supabase.url;
  const key = config.supabase.serviceRoleKey || config.supabase.anonKey;

  if (!url || !key) {
    if (config.isTest) {
      return null;
    }
    console.warn(
      '⚠️ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing. Database calls will fail until configured in .env'
    );
  }

  supabaseAdmin = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder-key', {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        // Explicitly set service role authorization so the client NEVER mutates to a restricted user session
        Authorization: `Bearer ${key}`,
      },
    },
  });

  return supabaseAdmin;
}

/**
 * Dedicated auth client using anon key for user authentication (signIn, signUp).
 * This ensures the shared supabaseAdmin client is never polluted by user sessions.
 */
export function getAuthClient() {
  const url = config.supabase.url || 'https://placeholder.supabase.co';
  const anonKey = config.supabase.anonKey || config.supabase.serviceRoleKey || 'placeholder-key';

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createClientForToken(token) {
  const url = config.supabase.url || 'https://placeholder.supabase.co';
  const anonKey = config.supabase.anonKey || config.supabase.serviceRoleKey || 'placeholder-key';

  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export default getSupabaseAdmin();
