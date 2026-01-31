import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
console.log("SUPABASE_URL =", SUPABASE_URL);
console.log("SUPABASE_ANON_KEY starts =", SUPABASE_ANON_KEY?.slice(0, 12));

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
