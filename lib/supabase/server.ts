// Klient Supabase dla serwera (Server Components i Server Actions).
// Czyta sesję z ciasteczek żądania. W Server Component nie da się zapisać ciasteczek,
// dlatego błąd w setAll ignorujemy: odświeżaniem sesji zajmuje się proxy.ts.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Wywołane z Server Component: ignorujemy, proxy odświeży sesję.
          }
        },
      },
    },
  );
}
