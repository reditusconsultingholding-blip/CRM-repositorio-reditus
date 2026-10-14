"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- guion de Node, igual que los del servidor */
// Supabase de mentira, en memoria, para probar la prospección de punta a punta
// SIN tocar el proyecto real: el CRM (`next dev`) se arranca apuntando aquí con
// NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<puerto>.
//
// Imita solo lo que usa la prospección:
//   · Storage: leer, subir, mover, listar y borrar objetos; consultar y crear buckets.
//   · Tablas (API tipo PostgREST): select con filtros eq / neq / in / not.in / ilike /
//     gte / lte / is, orden y límite; insert; update; conteo con HEAD.
// No hay permisos ni RLS: quien llega con cualquier clave, entra. Solo para pruebas.
const http = require("http");
const crypto = require("crypto");

function crear(opciones = {}) {
  /** Con `opciones.registro` (ruta de archivo) deja una línea por petición: sirve para depurar. */
  const anotar = (linea) => opciones.registro && require("fs").appendFileSync(opciones.registro, `${linea}\n`);
  /** `bucket/ruta` → { cuerpo: Buffer, tipo, fecha } */
  const objetos = new Map();
  const buckets = new Map([["trabajos", { id: "trabajos", name: "trabajos", public: false }], ["chat-files", { id: "chat-files", name: "chat-files", public: true }]]);
  /** tabla → filas */
  const tablas = { prospectos: [], users: [], notifications: [], push_subscriptions: [] };

  // ---------------------------------------------------------------- Storage ----
  const poner = (clave, cuerpo, tipo = "application/json") => objetos.set(clave, { cuerpo: Buffer.isBuffer(cuerpo) ? cuerpo : Buffer.from(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo)), tipo, fecha: new Date().toISOString() });

  function listar(bucket, prefijo, limite) {
    const base = `${bucket}/${prefijo ? prefijo.replace(/\/+$/, "") + "/" : ""}`;
    const hijos = new Map();
    for (const [clave, o] of objetos) {
      if (!clave.startsWith(base)) continue;
      const resto = clave.slice(base.length);
      const corte = resto.indexOf("/");
      if (corte < 0) hijos.set(resto, { name: resto, id: crypto.randomUUID(), updated_at: o.fecha, created_at: o.fecha, last_accessed_at: o.fecha, metadata: { size: o.cuerpo.length, mimetype: o.tipo } });
      else if (!hijos.has(resto.slice(0, corte))) hijos.set(resto.slice(0, corte), { name: resto.slice(0, corte), id: null, updated_at: null, created_at: null, last_accessed_at: null, metadata: null });
    }
    return [...hijos.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limite || 100);
  }

  function cuerpoDeSubida(req, crudo) {
    const tipo = String(req.headers["content-type"] || "");
    const m = /multipart\/form-data;\s*boundary=(.+)$/i.exec(tipo);
    if (!m) return { cuerpo: crudo, tipo: tipo || "application/octet-stream" };
    // FormData: la parte que trae Content-Type es el archivo.
    const partes = crudo.toString("latin1").split(`--${m[1]}`);
    for (const p of partes) {
      const corte = p.indexOf("\r\n\r\n");
      if (corte < 0 || !/content-type:/i.test(p.slice(0, corte))) continue;
      const t = (/content-type:\s*([^\r\n]+)/i.exec(p.slice(0, corte)) || [])[1] || "application/octet-stream";
      return { cuerpo: Buffer.from(p.slice(corte + 4).replace(/\r\n$/, ""), "latin1"), tipo: t };
    }
    return { cuerpo: Buffer.alloc(0), tipo: "application/octet-stream" };
  }

  // ----------------------------------------------------------------- tablas ----
  function valorDe(fila, columna) {
    // `respuestas_calificacion->prospeccion->>id_externo`
    const pasos = columna.split(/->>?/);
    let v = fila;
    for (const p of pasos) v = v == null ? undefined : v[p.trim()];
    return v;
  }
  function cumple(fila, columna, expr) {
    let e = expr;
    let negar = false;
    if (e.startsWith("not.")) {
      negar = true;
      e = e.slice(4);
    }
    const punto = e.indexOf(".");
    const op = e.slice(0, punto);
    const arg = e.slice(punto + 1);
    const v = valorDe(fila, columna);
    const texto = v == null ? null : String(v);
    let r;
    if (op === "eq") r = texto === arg;
    else if (op === "neq") r = texto !== arg;
    else if (op === "in") r = arg.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).includes(texto);
    else if (op === "ilike" || op === "like") r = texto != null && new RegExp(`^${arg.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*")}$`, op === "ilike" ? "i" : "").test(texto);
    else if (op === "gte") r = texto != null && texto >= arg;
    else if (op === "lte") r = texto != null && texto <= arg;
    else if (op === "gt") r = texto != null && texto > arg;
    else if (op === "lt") r = texto != null && texto < arg;
    else if (op === "is") r = arg === "null" ? v == null : String(v) === arg;
    else throw new Error(`operador no imitado: ${op}`);
    return negar ? !r : r;
  }
  function consultar(tabla, params) {
    let filas = (tablas[tabla] ||= []).slice();
    let orden = null;
    let limite = null;
    for (const [k, v] of params) {
      if (k === "select" || k === "columns" || k === "on_conflict" || k === "offset") continue;
      if (k === "order") orden = v;
      else if (k === "limit") limite = Number(v);
      else filas = filas.filter((f) => cumple(f, k, v));
    }
    if (orden) {
      const [col, dir] = orden.split(".");
      filas.sort((a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? "")) * (dir === "desc" ? -1 : 1));
    }
    return limite != null ? filas.slice(0, limite) : filas;
  }

  // --------------------------------------------------------------- servidor ----
  const servidor = http.createServer((req, res) => {
    const trozos = [];
    req.on("data", (c) => trozos.push(c));
    req.on("end", () => {
      const crudo = Buffer.concat(trozos);
      const u = new URL(req.url, "http://x");
      const responder = (estado, dato, cabeceras = {}) => {
        const cuerpo = dato === undefined ? "" : Buffer.isBuffer(dato) ? dato : JSON.stringify(dato);
        anotar(`${req.method} ${decodeURIComponent(u.pathname)} → ${estado}${req.method !== "GET" && crudo.length < 300 ? ` ${crudo.toString("utf8").replace(/\s+/g, " ")}` : ""}`);
        res.writeHead(estado, { "content-type": "application/json", ...cabeceras });
        res.end(req.method === "HEAD" ? undefined : cuerpo);
      };
      const json = () => {
        try {
          return JSON.parse(crudo.toString("utf8") || "{}");
        } catch {
          return {};
        }
      };
      try {
        const ruta = decodeURIComponent(u.pathname);
        // ---- Storage ----
        if (ruta.startsWith("/storage/v1/")) {
          const r = ruta.slice("/storage/v1/".length);
          if (r.startsWith("bucket")) {
            if (req.method === "POST") {
              const b = json();
              buckets.set(b.id || b.name, { id: b.id || b.name, name: b.name, public: !!b.public });
              return responder(200, { name: b.name });
            }
            const b = buckets.get(r.slice("bucket/".length));
            return b ? responder(200, b) : responder(404, { statusCode: "404", error: "Bucket not found", message: "Bucket not found" });
          }
          if (r === "object/move") {
            const b = json();
            const de = `${b.bucketId}/${b.sourceKey}`;
            const o = objetos.get(de);
            if (!o) return responder(404, { statusCode: "404", error: "not_found", message: "Object not found" });
            objetos.delete(de);
            objetos.set(`${b.destinationBucket || b.bucketId}/${b.destinationKey}`, { ...o, fecha: new Date().toISOString() });
            return responder(200, { message: "Successfully moved" });
          }
          if (r.startsWith("object/list/")) {
            const b = json();
            return responder(200, listar(r.slice("object/list/".length), b.prefix || "", b.limit));
          }
          if (r.startsWith("object/")) {
            const clave = r.slice("object/".length).replace(/^(public|authenticated)\//, "");
            if (req.method === "GET" || req.method === "HEAD") {
              const o = objetos.get(clave);
              return o ? responder(200, o.cuerpo, { "content-type": o.tipo }) : responder(400, { statusCode: "404", error: "not_found", message: "Object not found" });
            }
            if (req.method === "POST" || req.method === "PUT") {
              if (req.method === "POST" && objetos.has(clave) && String(req.headers["x-upsert"]) !== "true") return responder(400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
              const s = cuerpoDeSubida(req, crudo);
              poner(clave, s.cuerpo, s.tipo);
              return responder(200, { Key: clave, Id: crypto.randomUUID() });
            }
            if (req.method === "DELETE") {
              const b = json();
              const bucket = clave.split("/")[0];
              const borrados = [];
              for (const p of b.prefixes || []) if (objetos.delete(`${bucket}/${p}`)) borrados.push({ name: p });
              return responder(200, borrados);
            }
          }
          return responder(404, { message: `Storage: ruta no imitada ${req.method} ${ruta}` });
        }
        // ---- tablas ----
        if (ruta.startsWith("/rest/v1/")) {
          const tabla = ruta.slice("/rest/v1/".length);
          const filtros = [...u.searchParams.entries()];
          const unico = String(req.headers.accept || "").includes("vnd.pgrst.object");
          const prefiere = String(req.headers.prefer || "");
          const entregar = (filas, estado = 200) => {
            const cabeceras = { "content-range": `${filas.length ? `0-${filas.length - 1}` : "*"}/${filas.length}` };
            if (!unico) return responder(estado, filas, cabeceras);
            if (filas.length !== 1) return responder(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${filas.length} rows` });
            return responder(estado, filas[0], cabeceras);
          };
          if (req.method === "GET" || req.method === "HEAD") return entregar(consultar(tabla, filtros));
          if (req.method === "POST") {
            const nuevas = [].concat(json()).map((f) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...f }));
            (tablas[tabla] ||= []).push(...nuevas);
            return prefiere.includes("return=representation") ? entregar(nuevas, 201) : responder(201);
          }
          if (req.method === "PATCH") {
            const cambio = json();
            const filas = consultar(tabla, filtros);
            for (const f of filas) Object.assign(f, cambio);
            return prefiere.includes("return=representation") ? entregar(filas) : responder(204);
          }
          if (req.method === "DELETE") {
            const fuera = new Set(consultar(tabla, filtros));
            tablas[tabla] = tablas[tabla].filter((f) => !fuera.has(f));
            return responder(204);
          }
        }
        if (ruta.startsWith("/auth/v1/")) return responder(401, { message: "sin sesión (Supabase de prueba)" });
        return responder(404, { message: `ruta no imitada ${req.method} ${ruta}` });
      } catch (e) {
        return responder(500, { message: `Supabase de prueba: ${e.message}` });
      }
    });
  });

  return {
    objetos,
    tablas,
    poner,
    /** El JSON guardado en `bucket/ruta`, o null. */
    leer(clave) {
      const o = objetos.get(clave);
      if (!o) return null;
      try {
        return JSON.parse(o.cuerpo.toString("utf8"));
      } catch {
        return null;
      }
    },
    /** Claves que empiezan por un prefijo. */
    claves: (prefijo) => [...objetos.keys()].filter((k) => k.startsWith(prefijo)).sort(),
    escuchar: (puerto) => new Promise((ok) => servidor.listen(puerto, "127.0.0.1", ok)),
    cerrar: () => new Promise((ok) => servidor.close(ok)),
  };
}

module.exports = { crear };
