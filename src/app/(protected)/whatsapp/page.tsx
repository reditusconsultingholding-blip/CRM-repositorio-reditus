import { redirect } from "next/navigation";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Bot, Users } from "lucide-react";

export default async function WhatsAppPage() {
  const profile = await requireProfile();
  if (!(INGRESOS_ROLES as string[]).includes(profile.role)) redirect("/dashboard");

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
          <CardContent className="text-sm text-muted-foreground">
            Número dedicado a prospectos nuevos, con un agente de IA que sigue el protocolo comercial
            (saludo, portafolio, precios, agendar, cerrar) y escala a un humano cuando hace falta.
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
            <MessageCircle className="size-4" />
            Qué falta para activarlo
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            Conectar WhatsApp requiere acceso a la <strong>WhatsApp Business API</strong>, que solo se
            obtiene verificando tu negocio en <strong>Meta Business Manager</strong> (directo con Meta o
            vía un proveedor como Twilio/360dialog) — esa cuenta solo la puedes crear tú, no yo.
          </p>
          <p>
            Apenas tengas esas credenciales, aquí se activa la bandeja de mensajes en tiempo real para
            ambos números, con el historial de conversación, asignación de responsables y el agente de
            ventas siguiendo el protocolo de tu documento maestro.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
