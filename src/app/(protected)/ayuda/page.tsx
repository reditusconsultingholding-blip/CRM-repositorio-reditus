import { requireProfile } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5 text-sm text-muted-foreground [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </CardContent>
    </Card>
  );
}

type RoleDoc = {
  roleKey: string;
  rol: string;
  emoji: string;
  permisos: string[];
  buenasPracticas: string[];
  expectativas: string[];
};

const ROLES: RoleDoc[] = [
  {
    roleKey: "ceo",
    rol: "CEO",
    emoji: "👑",
    permisos: [
      "Acceso total: Ingresos, Requerimientos, Clientes, Chat, Usuarios, WhatsApp, Panel CEO.",
      "Único que ve el Panel CEO (rentabilidad, nómina editable, checklist de pago, asistente).",
      "Único que puede crear/editar usuarios y cambiar roles.",
    ],
    buenasPracticas: [
      "Revisa el checklist de pago cada lunes y marca a tiempo lo que ya pagaste.",
      "Actualiza la nómina en /ceo apenas cambie un valor real, no la dejes desactualizada.",
      "Usa el asistente del Panel CEO para preguntas rápidas de estado del negocio en vez de calcular a mano.",
    ],
    expectativas: [
      "Visión general del negocio, traer clientes, dirección de pagos y coordinación final.",
      "Que todo el equipo tenga lo que necesita para trabajar sin depender de ti para cada detalle.",
    ],
  },
  {
    roleKey: "gerente_comercial",
    rol: "Gerente Comercial",
    emoji: "💼",
    permisos: [
      "Ingresos: crear pedidos, ver todos, marcar pagos.",
      "Requerimientos: ver y comentar en ambos pipelines (video y landing).",
      "Clientes, Chat interno, WhatsApp (cuando esté activo).",
      "NO tiene acceso a Usuarios ni al Panel CEO.",
    ],
    buenasPracticas: [
      "Sigue el protocolo comercial de WhatsApp: saludo → portafolio → precios → pago → info → agendar → fecha clara → entrega → encuesta → ofrecer más.",
      "No prometas una fecha de entrega sin confirmar con Producción que hay capacidad.",
      "Registra cada venta en Ingresos apenas se cierre — no lo dejes para después.",
    ],
    expectativas: [
      "Cerrar ventas y dar seguimiento hasta el cobro y la entrega.",
      "Detectar oportunidades de recompra y venta adicional.",
    ],
  },
  {
    roleKey: "directora_operativa",
    rol: "Directora Operativa",
    emoji: "🗂️",
    permisos: [
      "Requerimientos: ver y gestionar ambos pipelines, asignar encargados, cambiar estados.",
      "Chat interno (todos los canales), Comentarios con @menciones.",
      "NO tiene acceso a Ingresos (cifras de ventas) ni al Panel CEO.",
    ],
    buenasPracticas: [
      "Revisa la información de cada pedido nuevo dentro de las primeras 2-3 horas.",
      "No dejes nada en conversaciones privadas — todo debe quedar registrado en el requerimiento o el canal correspondiente.",
      "Actualiza el estado apenas cambie: Nuevo → Asignado → En progreso → Por revisión → Terminado.",
      "Comunica un riesgo de atraso ANTES de la fecha prometida, nunca después.",
    ],
    expectativas: [
      "Anticipar problemas, no solo reaccionar — saber qué entró, qué falta y quién lo tiene.",
      "Coordinar fechas realistas con Comercial antes de que se le prometan al cliente.",
      "Cerrar cada servicio confirmando calidad y activando el seguimiento.",
    ],
  },
  {
    roleKey: "disenador_landing",
    rol: "Diseñador(a) de Landing",
    emoji: "🎨",
    permisos: [
      "Requerimientos: ve y trabaja el pipeline de Landing Pages (los suyos y los del equipo).",
      "Chat interno, comentarios en sus requerimientos.",
      "NO tiene acceso a Ingresos ni al Panel CEO.",
    ],
    buenasPracticas: [
      "Cuando termines el diseño, pasa el estado a \"Por subir\" para que se notifique al Programador automáticamente.",
      "Si el pedido no trae información suficiente, repórtalo en vez de adivinar.",
    ],
    expectativas: [
      "Entregar landing pages de calidad dentro del tiempo estimado (2-3 días por unidad).",
      "Dejar la página lista para que el Programador solo tenga que publicarla.",
    ],
  },
  {
    roleKey: "editor_video",
    rol: "Editor de Video",
    emoji: "🎬",
    permisos: [
      "Requerimientos: ve y trabaja el pipeline de Videos.",
      "Chat interno, comentarios en sus requerimientos.",
      "NO tiene acceso a Ingresos ni al Panel CEO.",
    ],
    buenasPracticas: [
      "Actualiza el estado del video apenas avances — el pago de tu semana se calcula sobre lo que quede marcado \"Terminado\".",
      "Reporta bloqueos o falta de información apenas los detectes, no esperes a la fecha límite.",
    ],
    expectativas: [
      "Cumplir la capacidad diaria acordada (~8 videos/día en conjunto con el equipo).",
      "Calidad consistente y correcciones mínimas.",
    ],
  },
  {
    roleKey: "programador",
    rol: "Programador",
    emoji: "🧑‍💻",
    permisos: [
      "Requerimientos: pestaña dedicada \"Programador\" con las landing pages listas para publicar.",
      "Chat interno (incluyendo el canal \"Programador\").",
      "NO tiene acceso a Ingresos ni al Panel CEO.",
    ],
    buenasPracticas: [
      "Revisa la pestaña \"Programador\" en Requerimientos con frecuencia — ahí aparece todo lo asignado a ti.",
      "Publica y marca como \"Terminado\" apenas la página quede en línea — de eso depende tu pago semanal.",
    ],
    expectativas: [
      "Publicar cada landing page ya diseñada de forma correcta y rápida.",
      "Confirmar que la página funciona antes de marcarla como terminada.",
    ],
  },
];

export default async function AyudaPage() {
  const profile = await requireProfile();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">¿Cómo funciona?</h1>
        <p className="text-sm text-muted-foreground">
          Guía completa de cada sección, permisos por rol y buenas prácticas — para que nadie se pierda.
        </p>
      </div>

      <Seccion titulo="🏠 Dashboard">
        <p>
          Tu punto de partida. Muestra videos y landing pages en curso vs. totales, y (si tienes acceso a
          Ingresos) los ingresos de hoy/del mes y un calendario con los pedidos de cada día.
        </p>
      </Seccion>

      <Seccion titulo="💲 Ingresos (solo CEO y Gerente Comercial)">
        <ul>
          <li>Botón <strong>&quot;Nuevo ingreso&quot;</strong>: cliente (identificado por su WhatsApp),
            y una o varias líneas de servicio/producto (botón &quot;+&quot; para combos).</li>
          <li>Al crear el ingreso se genera automáticamente la <strong>Cotización en PDF</strong>.</li>
          <li>Al marcar el pago como <strong>&quot;Pagado&quot;</strong> se genera la <strong>Cuenta de
            Cobro</strong> automáticamente.</li>
          <li>CEO y Gerente Comercial reciben notificación con el valor de cada ingreso nuevo.</li>
        </ul>
      </Seccion>

      <Seccion titulo="📋 Requerimientos">
        <p>Producción, separada en tres vistas: <strong>Video</strong>, <strong>Landing Page</strong> y
          <strong>Programador</strong> (esta última filtra las landing listas para publicar).</p>
        <ul>
          <li>Estado con desplegable o botón <strong>&quot;Pasar a siguiente fase →&quot;</strong>.</li>
          <li><strong>Encargado</strong> (diseña/edita) y, en landing, <strong>Programador</strong> (publica —
            se notifica solo cuando pasa a &quot;Por subir&quot;).</li>
          <li>Chat del requerimiento con @menciones — todo registrado, nada en privado.</li>
        </ul>
      </Seccion>

      <Seccion titulo="💬 Chat interno">
        <ul>
          <li><strong>Canales fijos</strong>: Grupo Operativo, Editores de Video, Editores de Landing,
            Programador.</li>
          <li><strong>Mensajes directos</strong> 1 a 1 con cualquier compañero activo.</li>
          <li>Reacciones con emoji, responder citando un mensaje, copiar, eliminar los tuyos.</li>
          <li>La burbuja sobre &quot;Chat interno&quot; muestra cuántos mensajes no has leído.</li>
        </ul>
      </Seccion>

      <Seccion titulo="👥 Clientes / 📱 WhatsApp / 👑 Panel CEO / ⚙️ Usuarios">
        <p>Visibles según tu rol — ver la tabla de permisos por rol más abajo para el detalle exacto.</p>
      </Seccion>

      <Seccion titulo="🙋 Mi perfil">
        <p>Foto, nombre, fecha de nacimiento, teléfono, correo y contraseña — todo editable por ti mismo.</p>
      </Seccion>

      <div className="flex flex-col gap-2 pt-2">
        <h2 className="font-heading text-lg font-semibold tracking-tight">Permisos, buenas prácticas y expectativas por rol</h2>
        <p className="text-sm text-muted-foreground">Tu rol actual está resaltado.</p>
      </div>

      {ROLES.map((r) => (
        <Card key={r.rol} className={r.roleKey === profile.role ? "border-primary" : undefined}>
          <CardHeader className="flex flex-row items-center gap-2">
            <CardTitle className="text-base">
              {r.emoji} {r.rol}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div>
              <Badge variant="secondary" className="mb-1.5">Permisos</Badge>
              <ul className="list-disc pl-5 text-muted-foreground">
                {r.permisos.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <Badge variant="secondary" className="mb-1.5">Buenas prácticas</Badge>
              <ul className="list-disc pl-5 text-muted-foreground">
                {r.buenasPracticas.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <Badge variant="secondary" className="mb-1.5">Qué se espera de este rol</Badge>
              <ul className="list-disc pl-5 text-muted-foreground">
                {r.expectativas.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      ))}

      <Seccion titulo="✅ Buenas prácticas generales (todos los roles)">
        <ul>
          <li><strong>Todo se registra en la app, no en chats privados.</strong> Si algo no está
            registrado, operativamente no existe.</li>
          <li>Actualiza el estado de tus requerimientos apenas cambien.</li>
          <li>Usa @menciones cuando necesites la atención de alguien específico.</li>
          <li>Revisa la campana de notificaciones y la burbuja del chat con frecuencia.</li>
          <li>No prometas una fecha de entrega sin validar capacidad real de producción.</li>
          <li>Comunica un riesgo de atraso ANTES de la fecha prometida, no después.</li>
          <li>Cambia tu contraseña genérica desde /perfil la primera vez que entres.</li>
        </ul>
      </Seccion>
    </div>
  );
}
