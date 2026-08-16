import { requireProfile, INGRESOS_ROLES, ADMIN_ROLES } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

export default async function AyudaPage() {
  const profile = await requireProfile();
  const veIngresos = (INGRESOS_ROLES as string[]).includes(profile.role);
  const esCeo = (ADMIN_ROLES as string[]).includes(profile.role);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">¿Cómo funciona?</h1>
        <p className="text-sm text-muted-foreground">
          Guía rápida de cada sección de la app y buenas prácticas para no perderse.
        </p>
      </div>

      <Seccion titulo="🏠 Dashboard">
        <p>
          Tu punto de partida. Muestra videos y landing pages en curso vs. totales, y (si tienes acceso a
          Ingresos) los ingresos de hoy/del mes y un calendario con los pedidos de cada día.
        </p>
      </Seccion>

      {veIngresos && (
        <Seccion titulo="💲 Ingresos">
          <p>
            <strong>Solo CEO y Gerente Comercial.</strong> Aquí se registra cada venta.
          </p>
          <ul>
            <li>Botón <strong>&quot;Nuevo ingreso&quot;</strong>: cliente (identificado por su WhatsApp),
              y una o varias líneas de servicio/producto (botón &quot;+&quot; para combos, ej. 10 landing
              + 10 videos en un mismo pedido).</li>
            <li>Al crear el ingreso se genera automáticamente la <strong>Cotización en PDF</strong>.</li>
            <li>Cuando marcas el pago como <strong>&quot;Pagado&quot;</strong>, se genera automáticamente
              la <strong>Cuenta de Cobro</strong> — ambas descargables desde la columna
              &quot;Documentos&quot;.</li>
            <li>CEO y Gerente Comercial reciben una notificación con el valor de cada ingreso nuevo.</li>
          </ul>
        </Seccion>
      )}

      <Seccion titulo="📋 Requerimientos">
        <p>Aquí vive toda la producción, separada en dos pipelines: <strong>Video</strong> y <strong>Landing Page</strong>.</p>
        <ul>
          <li>Cada requerimiento tiene un <strong>estado</strong> (Nuevo pedido → Asignado → En progreso →
            Por revisión → … → Terminado) que se actualiza desde el desplegable o con el botón
            <strong>&quot;Pasar a siguiente fase →&quot;</strong> en el detalle.</li>
          <li><strong>Encargado</strong>: quien diseña/edita. En landing pages, además hay un
            <strong>Programador</strong>: quien publica la página ya diseñada (se le notifica solo cuando
            el estado pasa a &quot;Por subir&quot;).</li>
          <li><strong>Chat del requerimiento</strong>: usa @menciones para avisarle a alguien específico —
            queda todo registrado ahí, no depende de conversaciones privadas.</li>
        </ul>
      </Seccion>

      <Seccion titulo="💬 Chat interno">
        <p>Reemplaza los grupos de WhatsApp para temas de trabajo.</p>
        <ul>
          <li><strong>Canales fijos</strong>: Grupo Operativo (todos), Editores de Video, Editores de
            Landing, Programador.</li>
          <li><strong>Mensajes directos</strong>: conversación privada 1 a 1 con cualquier compañero
            activo.</li>
          <li>La burbuja sobre &quot;Chat interno&quot; en el menú muestra cuántos mensajes no has leído.</li>
        </ul>
      </Seccion>

      {veIngresos && (
        <Seccion titulo="👥 Clientes (base de datos general)">
          <p>
            Lista de todos los clientes con su gasto acumulado — pedidos hechos desde la app y el
            histórico importado (2024-2026), para saber quién ha comprado más en total.
          </p>
        </Seccion>
      )}

      {veIngresos && (
        <Seccion titulo="📱 WhatsApp Business">
          <p>
            Próximamente: bandeja para tus 2 números (agente de ventas con IA + línea de clientes
            actuales). Todavía no está activo — falta la conexión con la API de WhatsApp Business de Meta.
          </p>
        </Seccion>
      )}

      {esCeo && (
        <Seccion titulo="👑 Panel CEO">
          <p><strong>Solo visible para ti.</strong></p>
          <ul>
            <li>Rentabilidad semanal y mensual, calculada automáticamente.</li>
            <li><strong>Nómina y costos fijos</strong>: editable — botón &quot;Editar nómina&quot;.</li>
            <li><strong>Checklist de pago</strong>: cuánto se le debe a cada persona la semana pasada, con
              botón &quot;Marcar pagado&quot; y seguimiento de puntualidad.</li>
            <li><strong>Asistente</strong>: chatea sobre el estado del negocio; también puede generar
              cotizaciones reales por conversación.</li>
          </ul>
        </Seccion>
      )}

      {esCeo && (
        <Seccion titulo="⚙️ Usuarios">
          <p><strong>Solo CEO.</strong> Crear cuentas nuevas, cambiar rol, activar/desactivar personas.</p>
        </Seccion>
      )}

      <Seccion titulo="🙋 Mi perfil">
        <p>Cambia tu propia contraseña — hazlo la primera vez que entres si te dieron una genérica.</p>
      </Seccion>

      <Seccion titulo="✅ Buenas prácticas">
        <ul>
          <li><strong>Todo se registra en la app, no en chats privados.</strong> Si algo no está
            registrado, operativamente no existe.</li>
          <li>Actualiza el estado de tus requerimientos apenas cambien — no lo dejes para después.</li>
          <li>Usa @menciones cuando necesites la atención de alguien específico.</li>
          <li>Revisa la campana de notificaciones y la burbuja del chat con frecuencia.</li>
          <li>No prometas una fecha de entrega sin validar capacidad real de producción.</li>
          <li>Comunica un riesgo de atraso ANTES de la fecha prometida, no después.</li>
        </ul>
      </Seccion>
    </div>
  );
}
