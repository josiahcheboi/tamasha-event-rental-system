// supabase-client.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Use the SAME service role key as your server
const SUPABASE_URL = "https://humeamgpybksjeyjvvsw.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1bWVhbWdweWJrc2pleWp2dnN3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjg3Mzc1MiwiZXhwIjoyMDc4NDQ5NzUyfQ.ZAtK_gIRVNLwiZLkLwbiSCLgv1TWVI8dsNhmK4zmw3E";

// Create and export client
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);