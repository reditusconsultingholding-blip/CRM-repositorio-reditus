"use client";

import { useEffect, useId, useState } from "react";

/** Renderiza un bloque ```mermaid del asistente como diagrama SVG real
 * (mapas mentales, flujos, etc.) — carga mermaid solo del lado del
 * cliente para no pesar el bundle de las páginas que no lo usan. */
export function MermaidDiagram({ code }: { code: string }) {
  const id = useId().replace(/:/g, "-");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    import("mermaid").then(async (mod) => {
      const mermaid = mod.default;
      mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict" });
      try {
        const { svg: rendered } = await mermaid.render(`mermaid-${id}`, code);
        if (active) setSvg(rendered);
      } catch {
        if (active) setError(true);
      }
    });
    return () => {
      active = false;
    };
  }, [code, id]);

  if (error) {
    return <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs">{code}</pre>;
  }

  if (!svg) {
    return <div className="h-24 animate-pulse rounded-md bg-muted" />;
  }

  return (
    <div
      className="my-1 overflow-x-auto rounded-md border bg-white p-3 [&_svg]:mx-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
