"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { addComment } from "@/app/(protected)/requerimientos/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Person = { id: string; name: string };

export function CommentForm({
  requerimientoId,
  people,
}: {
  requerimientoId: string;
  people: Person[];
}) {
  const [pending, startTransition] = useTransition();
  const [mentionedId, setMentionedId] = useState<string>("");
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(formData: FormData) {
    formData.set("requerimiento_id", requerimientoId);
    startTransition(async () => {
      const result = await addComment(formData);
      if (result?.error) {
        toast.error(result.error);
      } else {
        formRef.current?.reset();
        setMentionedId("");
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-col gap-2">
      <Textarea name="body" placeholder="Escribe un mensaje…" rows={2} required />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Etiquetar a</Label>
          <Select
            items={Object.fromEntries(people.map((p) => [p.id, p.name]))}
            value={mentionedId}
            onValueChange={(v) => setMentionedId(v ?? "")}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Nadie" />
            </SelectTrigger>
            <SelectContent>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="mentioned_user_id" value={mentionedId} />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Enviando…" : "Enviar"}
        </Button>
      </div>
    </form>
  );
}
