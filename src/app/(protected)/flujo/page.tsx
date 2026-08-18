import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getFlujoActivo, type FlujoItem, type FlujoItemRole } from "@/lib/flujo-activo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LiveSync } from "@/components/live-sync";

type Role = FlujoItemRole | "ceo" | "todos";

const ROLE_COLOR: Record<Role, string> = {
  ceo: "#1a3a7a",
  comercial: "#0f7a5c",
  operativa: "#b5722a",
  landing: "#7a3a9c",
  video: "#b5305c",
  claude: "#c26b1f",
  programador: "#2a7a9c",
  todos: "#5b6478",
};

const ROLE_LABEL: Record<Role, string> = {
  ceo: "CEO",
  comercial: "Gerente Comercial",
  operativa: "Directora Operativa",
  landing: "Diseñador(a) Landing",
  video: "Editor de Video",
  claude: "Encargado(a) Claude",
  programador: "Programador",
  todos: "Cualquiera",
};

const FASES = [
  { titulo: "Comercial", role: "comercial" as Role, etapas: "Prospecto · Cotización · Cierre · Pago" },
  { titulo: "Operaciones", role: "operativa" as Role, etapas: "Información · Agenda" },
  { titulo: "Producción", role: "landing" as Role, etapas: "Producción · Revisión · Entrega" },
  { titulo: "Postventa", role: "video" as Role, etapas: "Correcciones · Seguimiento · Recompra" },
];

const ETAPAS: {
  n: number;
  nombre: string;
  role: Role;
  roleLabel?: string;
  detalle: string;
  feature: string;
}[] = [
  { n: 1, nombre: "Prospecto", role: "comercial", detalle: "Primer contacto por WhatsApp — se identifica la necesidad del cliente.", feature: "WhatsApp Business (próximamente)" },
  { n: 2, nombre: "Cotización", role: "comercial", roleLabel: "Gerente Comercial / CEO", detalle: "Se registra el pedido con sus líneas de servicio; el PDF sale solo.", feature: "Ingresos → Nuevo ingreso, o Asistente CEO por chat" },
  { n: 3, nombre: "Cierre", role: "comercial", detalle: "El cliente aprueba la cotización y confirma el pedido.", feature: "Ingresos" },
  { n: 4, nombre: "Pago", role: "comercial", roleLabel: "Gerente Comercial / CEO", detalle: "Se marca el pago; la Cuenta de Cobro se genera automáticamente.", feature: "Ingresos → Estado de pago “Pagado”" },
  { n: 5, nombre: "Información", role: "operativa", detalle: "Se valida que el brief del cliente esté completo (producto, referencias, materiales).", feature: "Requerimientos → crear" },
  { n: 6, nombre: "Agenda", role: "operativa", detalle: "Se asigna un encargado y se confirma la fecha de entrega, validando capacidad real.", feature: "Requerimientos → Encargado" },
  { n: 7, nombre: "Producción", role: "landing", roleLabel: "Diseñador(a) Landing / Editor de Video", detalle: "Se ejecuta el trabajo; el estado avanza con el botón “Pasar a siguiente fase”.", feature: "Requerimientos → En progreso" },
  { n: 8, nombre: "Revisión", role: "operativa", roleLabel: "Directora Operativa / CEO", detalle: "Control de calidad antes de que el cliente lo vea.", feature: "Requerimientos → Por revisión" },
  { n: 9, nombre: "Entrega", role: "programador", roleLabel: "Programador / Editor de Video", detalle: "Landing: pasa a “POR SUBIR” y el Programador la publica. Video: se marca Terminado.", feature: "Requerimientos → pestaña Programador" },
  { n: 10, nombre: "Correcciones", role: "operativa", roleLabel: "Directora Operativa (Gerente Comercial da seguimiento para que no se pase)", detalle: "Ajustes pedidos por el cliente, coordinados por @mención en el chat del requerimiento.", feature: "Comentarios del requerimiento" },
  { n: 11, nombre: "Seguimiento", role: "operativa", roleLabel: "Directora Operativa / Gerente Comercial", detalle: "Encuesta de satisfacción y calidad — todavía no está construida.", feature: "Encuesta de calidad (pendiente)" },
  { n: 12, nombre: "Recompra", role: "comercial", detalle: "Se detectan clientes que no han vuelto a comprar, usando su histórico de gasto.", feature: "Clientes (base de datos general)" },
];

function FlujoTable({ items, emptyText }: { items: FlujoItem[]; emptyText: string }) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="flex items-center gap-3 rounded-md border p-2.5 text-sm hover:bg-muted/40"
        >
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ background: `${ROLE_COLOR[item.role]}1a`, color: ROLE_COLOR[item.role] }}
          >
            {item.etapaLabel}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {item.trackingId && <span className="font-mono text-xs text-muted-foreground">{item.trackingId} — </span>}
            {item.titulo}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{item.estado}</span>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
            style={{ background: ROLE_COLOR[item.role] }}
          >
            {item.responsableNombre ?? "Sin asignar"}
          </span>
        </Link>
      ))}
    </div>
  );
}

export default async function FlujoPage() {
  const profile = await requireProfile();
  const items = await getFlujoActivo();
  const misItems = items.filter((i) => i.responsableId === profile.id);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Flujo de trabajo</h1>
        <p className="text-sm text-muted-foreground">
          Las 12 etapas del negocio, quién entra en cada una, y qué está pasando ahora mismo.
        </p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">Flujo general</TabsTrigger>
          <TabsTrigger value="mio">Mi flujo</TabsTrigger>
          <TabsTrigger value="explicacion">Explicación</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Todo lo que sigue activo ahora mismo — quién es responsable y en qué etapa está.
            </p>
            <LiveSync tables={["ingresos", "requerimientos"]} />
          </div>
          <Card>
            <CardContent className="pt-4">
              <FlujoTable items={items} emptyText="Nada activo ahora mismo — todo entregado y pagado." />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mio" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Lo que te corresponde a ti en este momento.</p>
            <LiveSync tables={["ingresos", "requerimientos"]} />
          </div>
          <Card>
            <CardContent className="pt-4">
              <FlujoTable items={misItems} emptyText="No tienes nada pendiente ahora mismo." />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="explicacion" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Las 4 fases</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-4">
                {FASES.map((f, i) => (
                  <div key={f.titulo} className="flex items-center gap-2">
                    <div
                      className="flex-1 rounded-md border p-3"
                      style={{ borderColor: ROLE_COLOR[f.role], background: `${ROLE_COLOR[f.role]}14` }}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: ROLE_COLOR[f.role] }}>
                        {f.titulo}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{f.etapas}</p>
                    </div>
                    {i < FASES.length - 1 && (
                      <span className="hidden shrink-0 text-muted-foreground sm:block">→</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                El <strong className="text-foreground">CEO</strong> supervisa las 4 fases desde el Panel CEO
                (rentabilidad, nómina, checklist) sin operar cada paso.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Leyenda</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-x-4 gap-y-2">
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                <span key={r} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2.5 rounded-full" style={{ background: ROLE_COLOR[r] }} />
                  {ROLE_LABEL[r]}
                </span>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Las 12 etapas, en orden</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {ETAPAS.map((e) => (
                <div key={e.n} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold text-white"
                      style={{ background: ROLE_COLOR[e.role] }}
                    >
                      {e.n}
                    </span>
                    {e.n < ETAPAS.length && <span className="w-px flex-1 bg-border" />}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{e.nombre}</span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ background: `${ROLE_COLOR[e.role]}1a`, color: ROLE_COLOR[e.role] }}
                      >
                        {e.roleLabel ?? ROLE_LABEL[e.role]}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{e.detalle}</p>
                    <p className="font-mono text-xs text-primary">{e.feature}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            WhatsApp Business ya tiene el receptor construido (falta la credencial de Meta) y la encuesta de
            calidad post-entrega todavía no está construida.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
