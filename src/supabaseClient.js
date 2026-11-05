import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yropmbylciupftpximxn.supabase.co';
const supabaseAnonKey = 'sb_publishable_nJHY4oYPMlVe14iGb7paAA_ek1Ysa03';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);