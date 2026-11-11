// Next.js 16: dawny middleware.ts nazywa się teraz proxy.ts.
// Działa przed każdą stroną (poza plikami statycznymi) i wpuszcza tylko zalogowanego.
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
