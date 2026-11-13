import { createClient } from '@supabase/supabase-js';
import type { Database } from './lib/database';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
