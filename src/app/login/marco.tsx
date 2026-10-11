import { Activity, ClipboardList, DollarSign } from "lucide-react";

// Marco de las pantallas de acceso (ingresar y contraseña nueva): a la
// izquierda la marca a gran tamaño sobre un fondo de cuadrícula con una
// línea de escaneo; a la derecha, el formulario. En celular la marca va
// arriba, compacta.
const MODULOS = [
  { n: "01", icono: DollarSign, t: "Ingresos", d: "Prospectos, cotizaciones, cierres y pagos." },
  { n: "02", icono: ClipboardList, t: "Producción", d: "Videos y páginas, de la información a la entrega." },
  { n: "03", icono: Activity, t: "Pulso", d: "Ventas y conversión de cada cliente, al día." },
] as const;

export function LoginMarco({ children }: { children: React.ReactNode }) {
  return (
    <div className="rd-login relative flex min-h-screen flex-1 overflow-hidden bg-[#02040b] text-white">
      <div className="rd-login-fondo" aria-hidden="true" />
      <div className="rd-login-luz" aria-hidden="true" />
      <div className="rd-login-escaner" aria-hidden="true" />

      <div className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 items-center gap-10 px-6 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16 lg:px-14">
        <section className="rd-cascada flex flex-col gap-6 lg:gap-9">
          <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.32em] text-[#5cc8ff]">
            <span className="rd-login-punto" aria-hidden="true" />
            Sistema interno · acceso restringido
          </div>

          <div>
            <h1 className="rd-login-marca font-heading font-bold leading-[0.86] tracking-[-0.045em]">REDITUS</h1>
            <div className="mt-2 flex items-center gap-4 font-mono text-xs uppercase tracking-[0.62em] text-white/55 lg:mt-3 lg:text-sm">
              <span className="h-px w-10 bg-gradient-to-r from-[#0072ff] to-[#00c6ff] lg:w-16" aria-hidden="true" />
              Consulting
            </div>
          </div>

          <p className="max-w-xl font-heading text-2xl font-semibold leading-tight tracking-tight text-white/90 lg:text-[2.1rem]">
            El centro de mando de la agencia.
          </p>

          <ul className="hidden max-w-xl flex-col divide-y divide-white/10 border-y border-white/10 lg:flex">
            {MODULOS.map((m) => {
              const Icono = m.icono;
              return (
                <li key={m.n} className="flex items-center gap-5 py-4">
                  <span className="font-mono text-xs text-[#5cc8ff]">{m.n}</span>
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                    <Icono className="size-4 text-[#7cc4ff]" />
                  </span>
                  <span className="leading-tight">
                    <span className="block font-heading text-base font-semibold">{m.t}</span>
                    <span className="block text-sm text-white/50">{m.d}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rd-login-entra w-full max-w-md justify-self-center lg:justify-self-end">
          <div className="rd-login-caja relative rounded-3xl border border-white/10 bg-[#0a1226]/80 p-7 backdrop-blur-xl lg:p-9">
            <span className="rd-login-esq a" aria-hidden="true" />
            <span className="rd-login-esq b" aria-hidden="true" />
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}
