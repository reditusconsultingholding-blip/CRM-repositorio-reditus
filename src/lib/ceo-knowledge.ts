// Conocimiento estático de los manuales internos de Reditus (Documento
// Maestro Comercial y Operativo + Manual de Dirección Operativa), para que
// el asistente del CEO responda con las políticas, precios y bonos reales
// de la empresa. Si los documentos cambian, actualiza este archivo.

export const CEO_KNOWLEDGE = `
=== DOCUMENTO MAESTRO COMERCIAL Y OPERATIVO ===

Capacidad actual: 20 Landing Pages/mes, 140 Videos/mes (~8 videos diarios).
Tasa de referencia COMERCIAL para cotizar (fija, no la de mercado): 1 USD = 3.111 COP.

Precio base Landing Page Shopify: $355.000 COP / $114.11 USD (1 unidad).
Descuentos por volumen (landing pages): 3u=3% off, 6u=6%, 10u=10%, 16u=16%, 25u=25%.

Precio base Video convencional: $65.000 COP / $20.89 USD (1 unidad).
Descuentos por volumen (videos): 5u=5% off, 10u=10%, 20u=20%, 30u=30%, 50u=40%, 100u=50%.

Otros servicios: Hook adicional $2.85 USD/u. Imagen publicitaria $5.75 USD/u.

Tiempos de entrega: Landing Pages 2-3 días (1 día producción + 1 día subida/configuración).
Videos: capacidad ~8 diarios.

Flujo operativo: Prospecto → Cotización → Cierre → Pago → Información → Agenda →
Producción → Revisión → Entrega → Correcciones → Seguimiento → Recompra.

Fase 1 (actual): operación fluida, trazable e impecable — no depender de una persona.
Fase 2 (después de estabilizar): subir precios progresivamente hasta ~70%+ de
rentabilidad, aumentar valor percibido, nuevos paquetes y recompra.

Bonos Gerente Comercial (se calculan después del primer mes, sobre RENTABILIDAD
generada, no facturación):
- Nuevos cierres: cerrar $150 USD diarios (lun-vie) → 5% de la rentabilidad.
- Venta adicional: cliente que ya pidió y compra algo más el mismo día → 3.5%.
- Por entrega: proyectos entregados → 1.5%.

Protocolo comercial por WhatsApp (10 pasos): 1) Saludar, 2) Mostrar ejemplos/portafolio,
3) Precios promedio (agendar llamada para precisar), 4) Pago, 5) Solicitar información
(producto, enlaces, promos, logo, referencias, plataforma, observaciones, materiales),
6) Agendar (confirmar pago+info+reservar producción), 7) Fecha clara (basada en el
último espacio disponible), 8) Entrega y correcciones, 9) Seguimiento de calidad
(encuesta), 10) Ofrecer algo más (recompra, nuevos creativos/landings, paquetes).

=== MANUAL DE DIRECCIÓN OPERATIVA ===

Principio central: la Directora Operativa anticipa problemas, no solo reacciona.
Si algo no está registrado, no existe operativamente.

Responsabilidades: control diario, coordinación con Comercial/editores, trazabilidad,
calidad (prevenir errores desde recepción), seguimiento (detectar atrasos/bloqueos),
cierre (confirmar entrega + activar encuesta de calidad), aprendizaje continuo.

Checklist de recepción y asignación (8 pasos): 1) Recepción (info completa en 2-3h),
2) Información completa, 3) Guiones (a revisión del cliente antes de producción),
4) Claridad del cliente (cambios por falta de info = ajuste adicional pagado),
5) Agendamiento (mismo día si es posible), 6) Notificación al responsable,
7) Trazabilidad (todo registrado, no en chats privados), 8) Seguimiento (confirmar
que el responsable recibió y empezó).

Estados de proyecto: Nuevo/recibido → Información incompleta (bloqueo) → Listo para
producir → Asignado → En producción → En revisión → Correcciones → Listo para
entregar → Entregado → Cerrado/calidad.

Reporte de cierre del día: servicios pendientes, servicios a entregar mañana,
proyectos atrasados/en riesgo, responsable de cada pendiente, prioridad (alta/media/
baja), bloqueos, cliente que requiere comunicación, fecha comprometida, novedades de
editores, decisiones pendientes de Comercial/Dirección.

Encuesta de calidad post-entrega: satisfacción general, calidad, cumplimiento,
comunicación, correcciones, recomendación, autorización de testimonio.

Bonos Directora Operativa (sobre rentabilidad):
- Eficiencia y satisfacción: cerrar servicios sin quejas, cliente satisfecho
  (criterio asociado al mecanismo "Strike 3", que reduce el bono por incidente
  real — Sebastian aún no fija el umbral exacto: 3, 5 o 10 incidentes) → 5%.
- Cumplimiento del checklist → 3.5%.
- Seguimiento y mejora (novedades de editores, evitar atrasos, aprendizaje) → 1.5%.

KPIs operativos: servicios recibidos/entregados/pendientes/atrasados, tiempo promedio
de entrega, correcciones por servicio, quejas, satisfacción promedio, clientes que
recomiendan/autorizan testimonio, rentabilidad por periodo, productividad por editor,
proyectos cerrados semanal/quincenal/mensual.
`.trim();
