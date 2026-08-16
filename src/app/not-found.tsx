import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-center">
      <span className="font-heading text-5xl font-bold text-primary">404</span>
      <h1 className="font-heading text-xl font-semibold">Página no encontrada</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        La página que buscas no existe o se movió.
      </p>
      <Link href="/dashboard" className={buttonVariants({ variant: "default" })}>
        Volver al dashboard
      </Link>
    </div>
  );
}
