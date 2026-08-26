import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type CumplimientoRow = {
  userId: string;
  nombre: string;
  role: string;
  roleLabel: string;
  hoy: number | null;
  semana: number | null;
  mes: number | null;
};

function Pct({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">Sin tareas</span>;
  const color =
    value >= 80 ? "text-green-700 dark:text-green-400" : value >= 50 ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400";
  return <span className={`font-semibold ${color}`}>{value}%</span>;
}

/** Verificación de que el checklist se está cumpliendo de verdad — no solo
 * que exista, sino qué tan bien lo está siguiendo cada persona: hoy, y el
 * promedio de las últimas 1/7/30 días (los días sin ninguna marca cuentan
 * como 0%, no se ignoran, para que el promedio no maquille inasistencias). */
export function ChecklistCumplimiento({ rows }: { rows: CumplimientoRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay nadie con checklist activo.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Persona</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Hoy</TableHead>
            <TableHead>Promedio semana</TableHead>
            <TableHead>Promedio mes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.userId}>
              <TableCell className="font-medium">{r.nombre}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{r.roleLabel}</TableCell>
              <TableCell>
                <Pct value={r.hoy} />
              </TableCell>
              <TableCell>
                <Pct value={r.semana} />
              </TableCell>
              <TableCell>
                <Pct value={r.mes} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
