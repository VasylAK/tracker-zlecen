import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto w-full max-w-sm space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Tracker Zleceń</h1>
      <LoginForm />
    </main>
  );
}
