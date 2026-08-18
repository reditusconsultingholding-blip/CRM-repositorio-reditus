import Link from "next/link";
import { redirect } from "next/navigation";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { getBotKnowledgeSections } from "@/lib/bot-knowledge";
import { getVentasPipeline } from "@/lib/ventas-pipeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BotKnowledgeEditor } from "@/components/whatsapp/bot-knowledge-editor";
import { VentasPipelineBoard } from "@/components/whatsapp/ventas-pipeline-board";
import { LiveSync } from "@/components/live-sync";
import { ArrowLeft, Bot, Settings2, KanbanSquare } from "lucide-react";

export default async function LineaVentasPage() {
  const profile = await requireProfile();
  if (!(INGRESOS_ROLES as string[]).includes(profile.role)) redirect("/dashboard");

  const conectado = !!process.env.WHATSAPP_SALES_PHONE_NUMBER_ID;
  const [sections, pipeline] = await Promise.all([
    profile.role === "ceo" ? getBotKnowledgeSections() : Promise.resolve(null),
    getVentasPipeline(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Link
          href="/whatsapp"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          WhatsApp Business
        </Link>
      </div>

      <div>
        <h1 className="font-heading flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Bot className="size-6" />
          Línea de ventas
        </h1>
        <p className="text-sm text-muted-foreground">
          Número dedicado a prospectos nuevos, con un agente de IA que sigue el protocolo comercial.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Número conectado</CardTitle>
          <Badge variant={conectado ? "default" : "outline"}>
            {conectado ? "Conectado" : "Próximamente"}
          </Badge>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {conectado ? (
            <p>
              Ya tienes un número activo — los mensajes entrantes los responde el agente automáticamente
              siguiendo la configuración de abajo.
            </p>
          ) : (
            <p>
              Todavía no hay un número conectado. Falta la credencial de <strong>Meta Business Manager</strong> —
              ve a <Link href="/whatsapp" className="text-primary hover:underline">WhatsApp Business</Link> para
              ver qué falta exactamente.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <KanbanSquare className="size-4" />
            Conversaciones (pipeline)
          </CardTitle>
          <LiveSync tables={["prospectos"]} />
        </CardHeader>
        <CardContent>
          <VentasPipelineBoard items={pipeline} />
        </CardContent>
      </Card>

      {sections !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="size-4" />
              Configurar bot de respuesta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BotKnowledgeEditor sections={sections} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
