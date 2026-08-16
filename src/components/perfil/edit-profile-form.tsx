"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { updateMyProfile } from "@/app/(protected)/perfil/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EditProfileForm({
  userId,
  name,
  avatarUrl,
  birthdate,
  phone,
}: {
  userId: string;
  name: string;
  avatarUrl: string | null;
  birthdate: string | null;
  phone: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Selecciona una imagen.");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setPreview(data.publicUrl);

      const fd = new FormData();
      fd.set("name", name);
      fd.set("birthdate", birthdate ?? "");
      fd.set("phone", phone ?? "");
      fd.set("avatar_url", data.publicUrl);
      await updateMyProfile(fd);
      toast.success("Foto actualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir la foto");
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit(formData: FormData) {
    formData.set("avatar_url", preview ?? "");
    startTransition(async () => {
      try {
        await updateMyProfile(formData);
        toast.success("Perfil actualizado");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
      }
    });
  }

  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="group relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-lg font-semibold text-muted-foreground"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={name} className="size-full object-cover" />
          ) : (
            initials
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="size-5 text-white" />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
        <div className="text-sm text-muted-foreground">
          {uploading ? "Subiendo…" : "Haz clic en la foto para cambiarla."}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" defaultValue={name} required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="birthdate">Fecha de nacimiento</Label>
        <Input id="birthdate" name="birthdate" type="date" defaultValue={birthdate ?? ""} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Teléfono</Label>
        <Input id="phone" name="phone" defaultValue={phone ?? ""} placeholder="+57..." />
      </div>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}
