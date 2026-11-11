# Conteos y conciliación SICAR

## Arquitectura y compatibilidad

La app es una PWA Svelte 5/SvelteKit sin servidor de inventario. `inventory.ts`
contiene modelos, migración y reglas; `inventory-controller.svelte.ts` guarda los
cambios mediante la transacción existente de `database.ts` (Dexie/IndexedDB).
`ProductCard.svelte` reutiliza el formulario expandible. Voz y escáner siguen
registrando recuentos por la misma función `countInSession`.

`physical` representa la cantidad registrada actual. La presencia de `countedAt`
distingue un producto sin contar de un recuento de cero. `countedAt` ahora conserva
la referencia del último recuento físico: sumar, restar y aplicar ventas no la
cambian. No se infieren compras ni entradas por la diferencia del recuento.

`session.operations` es un historial opcional de operaciones. Cada registro contiene
ID, producto, tipo, cantidad anterior (null sin primer conteo), cantidad ingresada,
resultado, fecha/hora ISO y origen. Las ventas aplicadas incluyen `saleId` y
`saleOccurredAt`, separados de la fecha de aplicación. El arreglo legado
`movements` se conserva sin reinterpretarlo como ventas conciliadas.

No cambia el esquema de tablas IndexedDB. Los JSON existentes v1–v3 siguen siendo
compatibles; los nuevos respaldos v3 incluyen el historial dentro de la sesión.
La carga valida el historial cuando existe. No se reconstruyen operaciones antiguas
ni se inventan fechas ausentes. Reiniciar o crear una nueva sesión conserva el
historial; restaurar un respaldo restaura el historial de ese respaldo y archiva
el estado reemplazado con la transacción existente.

El JSON de Respaldo conserva fechas e historial para futuras conciliaciones. El
Excel Clave/Cantidad mantiene su contrato actual y no reemplaza ese respaldo.

## Operaciones manuales

- Sumar y Restar operan sobre una cantidad ya contada. Sin referencia física se
  solicita primero Recontar, sin usar la existencia del catálogo como conteo.
- Recontar sustituye la cantidad y establece una nueva referencia física, incluso
  en cero o en el primer conteo.
- La tarjeta presenta el resultado antes de confirmar. Un negativo bloquea la
  confirmación y solicita revisar la cantidad. No modifica datos silenciosamente.
- Cantidad e historial se guardan juntos. Si falla el almacenamiento, se conserva
  el estado anterior. El borrador se limpia al guardar para evitar repetir un clic.
- El historial por producto se consulta en la misma tarjeta.

## SICAR: motor preparado, importación de archivos pendiente

No hay reportes de ventas reales ni un importador de ventas en el repositorio.
El importador Excel/CSV existente (`catalog-import.ts`) es de catálogo, no de ventas.
No se creó un lector basado en supuestos de columnas ni una pantalla incompleta.

`sicar-reconciliation.ts` recibe ventas normalizadas mediante un contrato INTERNO,
no un formato atribuido a SICAR. `previewSicarSales` no modifica datos y clasifica:

- `included`: venta anterior al último recuento, ya reflejada físicamente.
- `eligible`: posterior al recuento y con saldo suficiente; requiere confirmación.
- `duplicate`: venta identificada que ya fue aplicada.
- `review`: fecha sin hora/zona verificable, instante igual al recuento, clave
  desconocida, sin primer conteo, ID repetido o saldo negativo.

`confirmSicarSales` exige selección explícita, una sesión activa y vuelve a evaluar
los descuentos contra el estado actual. Devuelve un nuevo estado con el historial
para guardarlo mediante la transacción existente. No está conectado a la interfaz
hasta verificar el archivo real. No modifica SICAR.

### Datos que hay que verificar con un reporte real

1. Tipo de archivo, hojas, encabezados y filas de totales.
2. Clave principal del producto y conservación de ceros iniciales.
3. Cantidad vendida, decimales, devoluciones, cancelaciones y signo.
4. Fecha y hora por venta o línea, precisión y zona horaria de la sucursal.
5. Identificador estable por línea (por ejemplo, folio + línea + sucursal, SOLO
   si existen y su unicidad se verifica). Debe mantenerse entre reportes solapados;
   un hash de archivo o la posición de fila no basta.
6. Si es detalle de ventas o agregado diario: sin orden verificable se deja
   pendiente de revisión, sin asumir una hora.

Después: adaptar la lectura existente de Excel/CSV a las columnas verificadas,
mostrar la vista previa y selección en la interfaz, actualizarla si cambia el
estado y guardar únicamente después de confirmación. Añadir fixtures reales
anonimizados y pruebas del lector y de la confirmación integrada. Las pruebas
actuales verifican el motor con datos sintéticos normalizados, no archivos SICAR.

No incluye Compras, equivalencias, traspasos ni escritura en SICAR.
