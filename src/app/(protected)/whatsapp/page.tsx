import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { getBotKnowledgeSections } from "@/lib/bot-knowledge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BotKnowledgeEditor } from "@/components/whatsapp/bot-knowledge-editor";
import { MessageCircle, Bot, Users, CalendarCheck } from "lucide-react";

export default async function WhatsAppPage() {
  const profile = await requireProfile();
  if (!(INGRESOS_ROLES as string[]).includes(profile.role)) redirect("/dashboard");
  const sections = profile.role === "ceo" ? await getBotKnowledgeSections() : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">WhatsApp Business</h1>
        <p className="text-sm text-muted-foreground">
          Bandeja de mensajes conectada a tus 2 números de WhatsApp Business.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="size-4" />
              Línea de ventas (agente IA)
            </CardTitle>
            <Badge variant="outline">Próximamente</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>
              Número dedicado a prospectos nuevos, con un agente de IA que sigue el protocolo comercial
              (saludo, portafolio, precios, agendar, cerrar) y escala a un humano cuando hace falta.
            </p>
            {sections !== null && (
              <div className="rounded-md border bg-background p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground">
                  Base de conocimiento del agente
                </p>
                <BotKnowledgeEditor sections={sections} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" />
              Línea de clientes actuales
            </CardTitle>
            <Badge variant="outline">Próximamente</Badge>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Bandeja para seguimiento, correcciones, recompra y soporte de clientes que ya te compraron.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarCheck className="size-4" />
            Ya listo: Prospectos + Calendly
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            Mientras se activa WhatsApp, el terreno ya está construido: cada vez que alguien agenda tu
            &quot;Llamada Estratégica de Crecimiento Digital&quot; en Calendly, aparece automáticamente
            en <Link href="/prospectos" className="text-primary hover:underline">Prospectos</Link>, con
            sus 5 respuestas de calificación. El agente de ventas, cuando esté conectado, va a compartir
            ese mismo link en vez de calificar todo por chat.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="size-4" />
            Qué falta para activar WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            Conectar WhatsApp requiere acceso a la <strong>WhatsApp Business API</strong>, que solo se
            obtiene verificando tu negocio en <strong>Meta Business Manager</strong> (directo con Meta o
            vía un proveedor como Twilio/360dialog) — esa cuenta solo la puedes crear tú, no yo.
          </p>
          <p>
            El receptor ya está construido y desplegado (<code>/api/whatsapp/webhook</code>) — apenas
            tengas las credenciales, conectar es solo: pegar 3 variables en Vercel y dar &quot;Verificar y
            guardar&quot; en Meta. El agente de ventas (<code>src/lib/whatsapp-agent.ts</code>) ya sigue el
            protocolo y la base de conocimiento de arriba.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
