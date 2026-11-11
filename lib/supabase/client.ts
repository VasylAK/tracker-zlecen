// Klient Supabase dla przeglądarki (Client Components).
// Używa tylko klucza publishable; sesję czyta z ciasteczek ustawionych przy logowaniu,
// więc RLS widzi mnie jako "authenticated".
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
