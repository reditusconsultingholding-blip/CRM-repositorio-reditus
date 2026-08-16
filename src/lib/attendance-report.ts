import "server-only";
import { createClient } from "@/lib/supabase/server";

// Hora límite (Bogotá) para considerar una entrada "a tiempo". Ajustable
// aquí si el horario del equipo cambia.
const HORA_LIMITE = 9;

export type AttendanceReportRow = {
  userId: string;
  name: string;
  clockIn: string;
  clockOut: string | null;
  tarde: boolean;
};

/** Últimos 7 días de marcas de entrada/salida de todo el equipo activo,
 * para que el CEO vea quién entra a tiempo. */
export async function computeAttendanceReport(): Promise<AttendanceReportRow[]> {
  const supabase = await createClient();

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 7);

  const { data } = await supabase
    .from("attendance")
    .select("user_id, clock_in, clock_out, users(name, active)")
    .gte("clock_in", since.toISOString())
    .order("clock_in", { ascending: false });

  return (data ?? [])
    .filter((row) => {
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      return user?.active !== false;
    })
    .map((row) => {
      const user = Array.isArray(row.users) ? row.users[0] : row.users;
      const horaBogota = new Date(row.clock_in).toLocaleString("en-US", {
        timeZone: "America/Bogota",
        hour: "numeric",
        hour12: false,
      });
      return {
        userId: row.user_id,
        name: user?.name ?? "—",
        clockIn: row.clock_in,
        clockOut: row.clock_out,
        tarde: Number(horaBogota) >= HORA_LIMITE,
      };
    });
}
