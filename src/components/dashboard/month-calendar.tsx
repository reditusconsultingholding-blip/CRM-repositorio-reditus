const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export type DiaData = { count: number; total: number };

export function MonthCalendar({
  year,
  month, // 0-indexed
  data, // key: "YYYY-MM-DD"
}: {
  year: number;
  month: number;
  data: Record<string, DiaData>;
}) {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  // getUTCDay: 0=domingo..6=sábado → convertimos a lunes=0..domingo=6
  const leadingBlanks = (firstOfMonth.getUTCDay() + 6) % 7;

  const todayKey = new Date().toISOString().slice(0, 10);

  const cells: { key: string | null; day: number | null }[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push({ key: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ key, day: d });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
        {DIAS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c.key) return <div key={i} className="aspect-square" />;
          const d = data[c.key];
          const isToday = c.key === todayKey;
          return (
            <div
              key={c.key}
              className={`flex aspect-square flex-col items-center justify-center rounded-md border p-1 text-center ${
                isToday ? "border-primary bg-primary/5" : "border-transparent bg-muted/40"
              }`}
              title={
                d
                  ? `${d.count} pedido(s) · ${d.total.toLocaleString("es-CO", { style: "currency", currency: "USD" })}`
                  : undefined
              }
            >
              <span className={`text-xs ${isToday ? "font-semibold text-primary" : ""}`}>{c.day}</span>
              {d && d.count > 0 && (
                <span className="text-[9px] font-medium text-green-700">{d.count}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
