import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";

// Fuente cursiva para la firma — se descarga una sola vez por invocación
// del servidor (react-pdf la cachea internamente tras el primer registro).
Font.register({
  family: "Great Vibes",
  src: "https://fonts.gstatic.com/s/greatvibes/v21/RWmMoKWR9v4ksMfaWd_JN-XC.ttf",
});

// Static "prestador de servicio" info — taken verbatim from Sebastian's Canva
// template (DAHNnU_KLNg). This is Alank/Reditus's fixed legal identity as an
// independent service provider and does not vary per document.
const PRESTADOR = {
  nombre: "Alank S Vargas V",
  identificacion: "1192760595",
  direccion: "Cll 6 oeste No. 35a-67 Edificio Habitaré cristales Apto 601",
  telefono: "3128043246",
  ciudad: "Cali",
  pais: "Colombia",
  firma: "Alank S Vargas Valencia",
};

const BLUE = "#1a3a7a";

const styles = StyleSheet.create({
  page: {
    fontSize: 9,
    color: "#1a1a1a",
    fontFamily: "Helvetica",
  },
  headerBar: {
    height: 70,
    backgroundColor: BLUE,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 28,
  },
  logoText: {
    color: "#ffffff",
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
  },
  logoSub: {
    color: "#cfe0ff",
    fontSize: 8,
    letterSpacing: 1,
  },
  body: {
    padding: 28,
  },
  title: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: BLUE,
    marginBottom: 3,
  },
  legalText: {
    fontSize: 7,
    color: "#555555",
    maxWidth: 300,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  box: {
    border: "1pt solid #999999",
  },
  boxHeader: {
    backgroundColor: "#eef2f9",
    padding: 3,
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    textAlign: "center",
  },
  boxCell: {
    flex: 1,
    borderRight: "1pt solid #999999",
    padding: 3,
    textAlign: "center",
  },
  infoBlock: {
    marginTop: 14,
    border: "1pt solid #999999",
  },
  infoRow: {
    flexDirection: "row",
    borderBottom: "1pt solid #999999",
  },
  infoLabel: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    padding: 4,
    width: "50%",
  },
  infoValue: {
    fontSize: 8,
    padding: 4,
    width: "50%",
    borderLeft: "1pt solid #999999",
  },
  table: {
    marginTop: 16,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: BLUE,
  },
  tableHeaderCell: {
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    padding: 5,
    flex: 1,
    textAlign: "center",
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "1pt solid #dddddd",
  },
  tableCell: {
    fontSize: 9,
    padding: 6,
    flex: 1,
    textAlign: "center",
  },
  totalsBlock: {
    marginTop: 16,
    alignSelf: "flex-end",
    width: 220,
  },
  subtotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 9,
    color: "#444444",
    marginBottom: 3,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    paddingTop: 6,
    borderTop: "1pt solid #999999",
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: BLUE,
  },
  signature: {
    marginTop: 50,
    alignItems: "center",
  },
  signatureScript: {
    fontFamily: "Great Vibes",
    fontSize: 30,
    color: "#1a1a1a",
    marginBottom: 2,
  },
  signatureLine: {
    width: 220,
    borderBottom: "1pt solid #333333",
    marginBottom: 4,
  },
});

function formatMoney(value: number, moneda: "USD" | "COP") {
  if (moneda === "USD") {
    return `US$${value.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${Math.round(value).toLocaleString("es-CO")} COP`;
}

export type DocumentoTipo = "cotizacion" | "cuenta_cobro";

export type DocumentoIngreso = {
  tracking_id: string;
  cantidad: number;
  servicio: string | null;
  producto: string | null;
  precio_final_descuento: number | null;
  moneda: "USD" | "COP" | null;
  cotizacion_numero: string | null;
  cuenta_cobro_numero: string | null;
  comision_plataforma: number | null;
  created_at: string;
};

export type DocumentoItem = {
  producto: string;
  servicio: string | null;
  cantidad: number;
  precio_unitario: number;
};

export type DocumentoCliente = {
  name: string;
  tax_id: string | null;
};

export function DocumentoReditus({
  tipo,
  ingreso,
  cliente,
  items,
}: {
  tipo: DocumentoTipo;
  ingreso: DocumentoIngreso;
  cliente: DocumentoCliente;
  items?: DocumentoItem[];
}) {
  const isCuentaCobro = tipo === "cuenta_cobro";
  const moneda = ingreso.moneda ?? "USD";
  const fecha = new Date(ingreso.created_at);
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");

  // Ingresos con servicios combinados traen varias líneas (ingreso_items).
  // Los ingresos antiguos (creados antes de esta función) no tienen filas en
  // ingreso_items — para esos, se arma una sola línea con los campos legacy
  // del ingreso.
  const lineas: DocumentoItem[] =
    items && items.length > 0
      ? items
      : [
          {
            producto: ingreso.producto || ingreso.servicio || "Servicio Reditus",
            servicio: ingreso.servicio,
            cantidad: ingreso.cantidad || 1,
            precio_unitario:
              (ingreso.cantidad || 1) > 0
                ? (ingreso.precio_final_descuento ?? 0) / (ingreso.cantidad || 1)
                : (ingreso.precio_final_descuento ?? 0),
          },
        ];

  const subtotal = items && items.length > 0
    ? items.reduce((sum, it) => sum + it.cantidad * it.precio_unitario, 0)
    : ingreso.precio_final_descuento ?? 0;
  const comisionPlataforma = ingreso.comision_plataforma ?? 0;
  const total = subtotal + comisionPlataforma;
  const numeroConsecutivo = isCuentaCobro ? ingreso.cuenta_cobro_numero : ingreso.cotizacion_numero;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBar}>
          <Text style={styles.logoText}>Reditus </Text>
          <Text style={{ ...styles.logoSub, marginTop: 8 }}>CONSULTING</Text>
        </View>

        <View style={styles.body}>
          <View style={styles.row}>
            <View style={{ maxWidth: 300 }}>
              <Text style={styles.title}>
                {isCuentaCobro ? "FACTURA DE COMPRA" : "COTIZACIÓN"}
              </Text>
              {isCuentaCobro && (
                <Text style={styles.legalText}>
                  Documento de obligatorio cumplimiento para operaciones con personas naturales no
                  responsables del impuesto a las ventas, decreto 522 de 2003.
                </Text>
              )}
            </View>

            <View style={{ width: 200 }}>
              <View style={styles.box}>
                <Text style={styles.boxHeader}>FECHA DE EXPEDICIÓN</Text>
                <View style={{ flexDirection: "row" }}>
                  <View style={styles.boxCell}>
                    <Text style={{ fontSize: 6 }}>AÑO</Text>
                    <Text>{anio}</Text>
                  </View>
                  <View style={styles.boxCell}>
                    <Text style={{ fontSize: 6 }}>MES</Text>
                    <Text>{mes}</Text>
                  </View>
                  <View style={{ ...styles.boxCell, borderRight: "none" }}>
                    <Text style={{ fontSize: 6 }}>DÍA</Text>
                    <Text>{dia}</Text>
                  </View>
                </View>
              </View>
              <View style={{ ...styles.box, borderTop: "none" }}>
                <Text style={styles.boxHeader}>ESPACIO DE USO EXCLUSIVO PARA LA EMPRESA</Text>
                <View style={{ padding: 4 }}>
                  <Text style={{ fontSize: 7, marginBottom: 2 }}>
                    Número de consecutivo: {numeroConsecutivo ?? "—"}
                  </Text>
                  <Text style={{ fontSize: 7 }}>Identificador Pedido: {ingreso.tracking_id}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.infoBlock}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>NOMBRE (VENDEDOR O PRESTADOR DE SERVICIO)</Text>
              <Text style={styles.infoValue}>{PRESTADOR.nombre}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>NÚMERO DE IDENTIFICACIÓN</Text>
              <Text style={styles.infoValue}>{PRESTADOR.identificacion}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>DIRECCIÓN COMPLETA</Text>
              <Text style={styles.infoValue}>{PRESTADOR.direccion}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>NÚMERO DE CONTACTO / CIUDAD / PAÍS</Text>
              <Text style={styles.infoValue}>
                {PRESTADOR.telefono} · {PRESTADOR.ciudad} · {PRESTADOR.pais}
              </Text>
            </View>
            <View style={{ ...styles.infoRow, borderBottom: "none" }}>
              <Text style={styles.infoLabel}>NOMBRE O RAZÓN SOCIAL (CLIENTE)</Text>
              <Text style={styles.infoValue}>{cliente.name}</Text>
            </View>
            <View style={{ ...styles.infoRow, borderTop: "1pt solid #999999", borderBottom: "none" }}>
              <Text style={styles.infoLabel}>NIT O CÉDULA</Text>
              <Text style={styles.infoValue}>{cliente.tax_id || "Sin especificar"}</Text>
            </View>
          </View>

          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={styles.tableHeaderCell}>Concepto</Text>
              <Text style={styles.tableHeaderCell}>Cantidad</Text>
              <Text style={styles.tableHeaderCell}>Precio</Text>
              <Text style={styles.tableHeaderCell}>Total</Text>
            </View>
            {lineas.map((linea, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={styles.tableCell}>
                  {linea.servicio ? `${linea.servicio} — ${linea.producto}` : linea.producto}
                </Text>
                <Text style={styles.tableCell}>{linea.cantidad}</Text>
                <Text style={styles.tableCell}>{formatMoney(linea.precio_unitario, moneda)}</Text>
                <Text style={styles.tableCell}>
                  {formatMoney(linea.cantidad * linea.precio_unitario, moneda)}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.totalsBlock}>
            {comisionPlataforma > 0 && (
              <>
                <View style={styles.subtotalRow}>
                  <Text>Subtotal</Text>
                  <Text>{formatMoney(subtotal, moneda)}</Text>
                </View>
                <View style={styles.subtotalRow}>
                  <Text>Comisión plataforma</Text>
                  <Text>{formatMoney(comisionPlataforma, moneda)}</Text>
                </View>
              </>
            )}
            <View style={styles.totalRow}>
              <Text>Total a pagar</Text>
              <Text>{formatMoney(total, moneda)}</Text>
            </View>
          </View>

          <View style={styles.signature}>
            <Text style={styles.signatureScript}>{PRESTADOR.firma}</Text>
            <View style={styles.signatureLine} />
            <Text style={{ fontSize: 9 }}>{PRESTADOR.firma}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
