"use strict";
// Lee la página pública de una tienda para saber: si es Shopify, si vende en
// el país buscado, cuál es su producto estrella, hace cuánto existe y cuál es
// su correo de contacto. Solo usa lo que la tienda publica; no inicia sesión
// en nada ni envía formularios.
//
// Lecciones de la prospección hecha a mano (sept. 2026), aplicadas aquí:
//   · Shopify responde 429 con más de 2 peticiones a la vez o con un
//     User-Agent corto: va de una tienda a la vez, con pausa y UA completo.
//   · Sacar teléfonos del HTML con una expresión regular produce números
//     falsos (parámetros ?v= de imágenes, identificadores): solo se acepta un
//     teléfono que venga en un enlace tel: o de WhatsApp.
//   · Hay correos de plantilla (correo@tutienda.com) y de plataformas: se filtran.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const CORREO = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi;

const CORREOS_AJENOS = /@(shopify\.com|myshopify\.com|example\.(com|org|net)|sentry\.io|wixpress\.com|sentry-next\.wixpress\.com|godaddy\.com|schema\.org|w3\.org|gravatar\.com|cloudflare\.com|google\.com|facebook\.com|klaviyo\.com|judge\.me|tutienda\.com|mitienda\.com|tudominio\.com|dominio\.com|domain\.com|email\.com|correo\.com|ejemplo\.com|yourstore\.com|mystore\.com)$/i;
const LOCAL_MALO = /^(no-?reply|noreply|no-?responder|donotreply|mailer-daemon|postmaster|abuse|privacy|dmca|legal|correo|tucorreo|email|tuemail|youremail|nombre|usuario|user|ejemplo|example|name|xxx+)$/i;
const NO_ES_CORREO = /\.(png|jpe?g|gif|webp|svg|css|js|avif|woff2?)$/i;

/** ¿Es una dirección a la que tiene sentido escribir? `permitirEjemplo` solo para las pruebas. */
function correoSirve(c, permitirEjemplo) {
  const correo = String(c || "").toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}$/.test(correo) || correo.length > 80 || NO_ES_CORREO.test(correo)) return false;
  const [local, dominio] = correo.split("@");
  if (LOCAL_MALO.test(local) || /^[0-9a-f]{20,}$/.test(local) || /^\d+$/.test(dominio.split(".")[0])) return false;
  if (permitirEjemplo && /(^|\.)example\.(com|org|net)$/.test(dominio)) return true;
  return !CORREOS_AJENOS.test(correo);
}

/** Correos del texto, ordenados: primero los del dominio de la tienda, luego los de buzones comunes. */
function correosDe(html, dominio, permitirEjemplo) {
  const texto = String(html || "").replace(/&#64;|&commat;/g, "@").replace(/\s*\[at\]\s*/gi, "@");
  const vistos = [...new Set((texto.match(CORREO) || []).map((c) => c.toLowerCase().replace(/^(mailto:)/, "")))].filter((c) => correoSirve(c, permitirEjemplo));
  const raiz = dominio.replace(/^www\./, "");
  const peso = (c) => (c.endsWith(`@${raiz}`) ? 0 : /@(gmail|hotmail|outlook|yahoo|icloud|proton)\./.test(c) ? 1 : 2);
  return vistos.sort((a, b) => peso(a) - peso(b));
}

const meta = (html, prop) => {
  const m = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i").exec(html) || new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, "i").exec(html);
  return m ? decodificar(m[1]) : "";
};
const decodificar = (s) =>
  String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

function monedaDe(html) {
  const m = /Shopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([A-Z]{3})"/.exec(html) || /"currency(?:Code)?"\s*:\s*"([A-Z]{3})"/.exec(html) || /<meta[^>]+(?:og:price:currency|product:price:currency)["'][^>]*content=["']([A-Z]{3})["']/i.exec(html);
  return m ? m[1] : "";
}

/** ¿La tienda vende en ese país? Se decide por la moneda; el idioma y el dominio solo confirman. */
function esDelPais(pais, d) {
  if (pais === "MX") return d.moneda === "MXN" || (!d.moneda && /\.mx$/.test(d.dominio));
  if (pais === "ES") {
    if (d.moneda && d.moneda !== "EUR") return false;
    const espanol = /^es/i.test(d.idioma) || /\.es$/.test(d.dominio);
    const mencion = /(espa[ñn]a|pen[ií]nsula|baleares|canarias|contrareembolso|contra reembolso)/i.test(d.texto);
    return d.moneda === "EUR" ? espanol || mencion : espanol && mencion;
  }
  return false;
}

function crearLector(opciones = {}) {
  const pedir = opciones.fetch || fetch;
  const pausaMs = opciones.pausaMs ?? 1500;
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  async function traer(url, comoJson) {
    for (let intento = 0; intento < 2; intento++) {
      let res;
      try {
        res = await pedir(url, { headers: { "user-agent": UA, accept: comoJson ? "application/json" : "text/html,application/xhtml+xml", "accept-language": "es-ES,es;q=0.9" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
      } catch {
        return null; // sin reintento en errores de red: una tienda caída no vale la espera
      }
      if (res.status === 429 && intento === 0) {
        await dormir(Math.min(20_000, (Number(res.headers.get("retry-after")) || 8) * 1000));
        continue;
      }
      if (!res.ok) return null;
      const texto = (await res.text()).slice(0, 1_500_000);
      if (!comoJson) return texto;
      try {
        return JSON.parse(texto);
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * @returns {{ ok: true, datos: object } | { ok: false, motivo: string }}
   * `pista`: lo que se sabe por los anuncios ({ handle } del producto anunciado, { nombre } de la página).
   */
  async function analizarTienda(dominio, pais, pista = {}, reglas = { soloShopify: true }) {
    const base = `https://${dominio}`;
    const catalogo = await traer(`${base}/products.json?limit=250`, true);
    const productos = catalogo && Array.isArray(catalogo.products) ? catalogo.products : null;
    await dormir(pausaMs);
    const home = await traer(`${base}/`, false);
    if (!home) return { ok: false, motivo: "la tienda no respondió" };

    let plataforma = productos ? "shopify" : /cdn\.shopify\.com|Shopify\.theme/i.test(home) ? "shopify" : /woocommerce|wp-content\/plugins\/woocommerce/i.test(home) ? "woocommerce" : /prestashop/i.test(home) ? "prestashop" : "otra";
    if (plataforma === "shopify" && !productos) plataforma = "shopify"; // Shopify con el catálogo público cerrado
    if (reglas.soloShopify && plataforma !== "shopify") return { ok: false, motivo: `no es Shopify (${plataforma})` };

    const texto = home.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").slice(0, 60_000);
    const d = { dominio, moneda: monedaDe(home), idioma: (/<html[^>]+lang=["']([a-zA-Z-]{2,8})["']/i.exec(home) || [])[1] || "", texto };
    if (!esDelPais(pais, d)) return { ok: false, motivo: `no vende en ${pais === "ES" ? "España" : "México"} (moneda ${d.moneda || "sin dato"}, idioma ${d.idioma || "sin dato"})` };

    // Producto estrella: el que anuncian; si no se sabe, el más vendido de la tienda; si no, el primero del catálogo.
    let producto = null;
    if (productos && pista.handle) producto = productos.find((p) => p.handle === pista.handle) || null;
    if (!producto && productos && productos.length) {
      await dormir(pausaMs);
      const masVendidos = await traer(`${base}/collections/all?sort_by=best-selling`, false);
      const handle = masVendidos ? (/href=["'][^"']*\/products\/([a-z0-9][a-z0-9-]*)/i.exec(masVendidos.slice(masVendidos.search(/<main|id=["']MainContent/i))) || [])[1] : "";
      producto = (handle && productos.find((p) => p.handle === handle)) || productos[0];
    }
    const precioNum = producto && producto.variants && producto.variants[0] ? Number(producto.variants[0].price) : NaN;
    const simbolo = d.moneda === "EUR" ? "€" : d.moneda === "MXN" ? "MXN" : d.moneda;
    const fechas = (productos || []).map((p) => Date.parse(p.created_at || p.published_at)).filter(Number.isFinite);
    // Con 250 productos el catálogo está cortado: la fecha más vieja que se ve no es la de la tienda.
    const tiendaDias = fechas.length && productos.length < 250 ? Math.floor((Date.now() - Math.min(...fechas)) / 86_400_000) : null;

    // Correo: portada y, si hace falta, las páginas donde suele estar (contacto y aviso legal).
    let correos = correosDe(home, dominio, opciones.permitirEjemplo);
    for (const ruta of ["/pages/contacto", "/pages/contact", "/policies/legal-notice", "/pages/aviso-legal", "/policies/privacy-policy"]) {
      if (correos.length) break;
      await dormir(pausaMs);
      const pagina = await traer(base + ruta, false);
      if (pagina) correos = correosDe(pagina, dominio, opciones.permitirEjemplo);
    }

    const telefono = (/href=["'](?:tel:|https?:\/\/(?:wa\.me|api\.whatsapp\.com\/send\?phone=))(\+?[\d\s().-]{8,20})/i.exec(home) || [])[1] || "";
    const instagram = (/https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9._]{2,40})/i.exec(home) || [])[1] || "";
    const nombre = meta(home, "og:site_name") || decodificar((/<title[^>]*>([^<]{2,120})/i.exec(home) || [])[1] || "").split(/\s[|–—-]\s/)[0] || pista.nombre || dominio;

    return {
      ok: true,
      datos: {
        dominio,
        tienda: nombre.slice(0, 120),
        url: base,
        plataforma,
        correo: correos[0] || "",
        telefono: telefono.replace(/[^\d+]/g, "").slice(0, 20),
        instagram: instagram && !/^(p|reel|explore|accounts)$/i.test(instagram) ? `@${instagram}` : "",
        producto: producto ? decodificar(producto.title).slice(0, 200) : "",
        productoUrl: producto ? `${base}/products/${producto.handle}` : "",
        precio: Number.isFinite(precioNum) ? `${precioNum.toFixed(2).replace(/\.00$/, "")} ${simbolo}`.trim() : "",
        tiendaDias,
      },
    };
  }

  return { analizarTienda };
}

module.exports = { crearLector, correosDe, correoSirve, esDelPais, monedaDe };
