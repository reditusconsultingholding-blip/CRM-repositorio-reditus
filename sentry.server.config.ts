// Reditus CRM — monitoreo de errores en el servidor (Server Actions, rutas
// API, Server Components). Si SENTRY_DSN no está configurado, el SDK
// simplemente no envía nada — no rompe nada en local ni si el CEO todavía
// no ha pegado la variable en Vercel.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.2,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  enabled: !!process.env.SENTRY_DSN,
});
