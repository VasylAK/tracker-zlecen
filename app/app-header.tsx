// Wspólny nagłówek przyklejony do góry ekranu (sticky): nazwa aplikacji prowadzi
// zawsze do strony głównej, więc na telefonie nie trzeba przewijać do "Anuluj".
// Nie ma go na /login, bo tam nie ma jeszcze sesji.
import Link from "next/link";
import { signOut } from "./login/actions";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-gray-300 bg-[var(--background)]">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-xl font-semibold">
          Tracker Zleceń
        </Link>
        <div className="flex gap-2">
          <Link href="/opportunities/new" className="rounded bg-black px-3 py-2 font-medium text-white">
            Nowa aplikacja
          </Link>
          <form action={signOut}>
            <button type="submit" className="rounded border border-gray-300 px-3 py-2">
              Wyloguj
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
