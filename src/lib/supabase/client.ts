import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Ingreso con huella / PIN del dispositivo (passkeys): Supabase lo
      // mantiene como función experimental y hay que pedirlo explícitamente.
      auth: { experimental: { passkey: true } },
    },
  );
}
