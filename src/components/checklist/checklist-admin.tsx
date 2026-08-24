"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { crearItem, editarItem, eliminarItem } from "@/app/(protected)/checklist/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

type Item = { id: string; role: string; texto: string; orden: number };

export function ChecklistAdmin({ itemsPorRol, roles }: { itemsPorRol: Record<string, Item[]>; roles: { value: string; label: string }[] }) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editTexto, setEditTexto] = useState("");
  const [nuevoTexto, setNuevoTexto] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function agregar(role: string) {
    const texto = (nuevoTexto[role] ?? "").trim();
    if (!texto) return;
    const orden = (itemsPorRol[role]?.length ?? 0) + 1;
    startTransition(async () => {
      const result = await crearItem(role, texto, orden);
      if (result?.error) toast.error(result.error);
      else setNuevoTexto((prev) => ({ ...prev, [role]: "" }));
    });
  }

  function guardarEdicion() {
    if (!editandoId) return;
    startTransition(async () => {
      const result = await editarItem(editandoId, editTexto);
      if (result?.error) toast.error(result.error);
      setEditandoId(null);
    });
  }

  function borrar(id: string) {
    if (!confirm("¿Quitar esta tarea del checklist?")) return;
    startTransition(async () => {
      const result = await eliminarItem(id);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <Tabs defaultValue={roles[0]?.value}>
      <TabsList>
        {roles.map((r) => (
          <TabsTrigger key={r.value} value={r.value}>
            {r.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {roles.map((r) => (
        <TabsContent key={r.value} value={r.value} className="flex flex-col gap-2">
          {(itemsPorRol[r.value] ?? []).map((item) => (
            <div key={item.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              {editandoId === item.id ? (
                <>
                  <Input
                    value={editTexto}
                    onChange={(e) => setEditTexto(e.target.value)}
                    className="h-8"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && guardarEdicion()}
                  />
                  <Button size="icon-sm" onClick={guardarEdicion} disabled={pending}>
                    <Check className="size-3.5" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => setEditandoId(null)}>
                    <X className="size-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1">{item.texto}</span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => {
                      setEditandoId(item.id);
                      setEditTexto(item.texto);
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => borrar(item.id)} disabled={pending}>
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </>
              )}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input
              value={nuevoTexto[r.value] ?? ""}
              onChange={(e) => setNuevoTexto((prev) => ({ ...prev, [r.value]: e.target.value }))}
              placeholder="Nueva tarea…"
              className="h-8"
              onKeyDown={(e) => e.key === "Enter" && agregar(r.value)}
            />
            <Button size="icon-sm" onClick={() => agregar(r.value)} disabled={pending}>
              <Plus className="size-3.5" />
            </Button>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
