# Conteos e importación de movimientos (0.9.0)

## Arquitectura y conservación

SvelteKit/Svelte 5, sin servidor. Dexie mantiene la base `matre-inventario-db`
en versión 1 con las tablas originales `state` y `backups`. No hay migración de
tablas ni borrado o reinicio al abrir la aplicación. La carga no recalcula ni
guarda las nuevas conciliaciones automáticamente.

Los datos nuevos son campos opcionales de `InventorySession`:

- `inventoryTimeZone`: zona IANA confirmada por el usuario.
- `importedMovements`: documentos originales, decisión sobre reingreso, estado y
  referencia del conteo usado en la evaluación actual.
- `movementBaselines`: referencias físicas verificables, incluyendo las capturadas
  de conteos antiguos que no tenían un evento de recuento.
- `reconciliationLog`: auditoría append-only de estados, referencias y resultados.

Las operaciones manuales originales en `operations` no se reescriben. Los orígenes
legados se conservan como datos históricos; el módulo nuevo es genérico.
`physical` es el saldo actual; `countedAt` sigue identificando el recuento físico.
Sumar y Restar no cambian esa referencia. Un producto Pendiente conserva sus
movimientos importados sin cambiar su existencia.

Los nuevos respaldos con zona o movimientos usan JSON v4. Se aceptan v1–v3 sin
inventar información ni reinterpretar sus timestamps. Restaurar un JSON sigue
siendo una acción explícita con vista previa y copia local previa. Importar un
Excel agrega movimientos, no reemplaza la base ni el inventario.

Cada guardado del controlador incluye una revisión esperada del estado. La
transacción rechaza una pestaña atrasada en lugar de sobrescribir trabajo más
reciente. Se necesita recargar y revisar otra vez. Esta protección funciona entre
las pestañas que usan esta versión; no controla una versión antigua que siga
abierta y escriba usando el código anterior.

## Archivo Excel

Una sola hoja .xlsx, con exactamente los encabezados `Folio`, `Clave`, `Fecha`,
`Hora`, `Cantidad` (pueden estar en distinto orden). No se infieren columnas de
otras hojas. Máximo 20 MB y 50,000 filas de datos por archivo.

Folios y claves se conservan como texto. Una celda numérica entera también puede
leerse con su formato de ceros de Excel, siempre que sea representable exactamente
y sin notación científica. No se pueden recuperar ceros que el archivo ya perdió.
Se recomienda usar celdas de texto. La clave principal se compara exactamente,
sin buscar por descripción, clave alterna, subcadenas o normalización de letras.

La fecha textual exige DD/MM/AAAA; la hora textual HH:mm:ss en formato de 24
horas. Se validan fechas reales, incluyendo años bisiestos. Se leen seriales de
fecha de Excel con sistemas 1900 y 1904 y fracciones de día con formato de hora
que incluya segundos. Se rechazan fórmulas en las columnas obligatorias, horas
incompletas y la fecha ficticia 29/02/1900. Una medianoche explícita es válida;
una celda vacía nunca se transforma en medianoche.

Las cantidades deben ser numéricas y positivas; se admiten decimales. Para texto
numérico se usa punto decimal, sin separadores de miles. Las filas completamente
vacías se reportan y omiten; una fila parcialmente vacía produce errores. Cualquier
error de formato, clave desconocida, duplicado interno o conflicto bloquea todo
el archivo para corregirlo. La vista previa no escribe datos.

## Identidad y confirmación

El identificador es la serialización de la tupla `[tipo, folio, clave]`: evita
colisiones por concatenar textos con separadores. Ventas y notas de crédito tienen
espacios independientes. Reimportar la misma identidad con los mismos datos es un
duplicado: conserva el registro, la fecha de importación y el saldo. Si cambia la
cantidad, fecha u hora, se informa conflicto y se bloquea la confirmación.

Las notas de crédito se guardan inicialmente sin reingreso confirmado. Solo la
selección explícita «Confirmo que reingresó la mercancía» permite un incremento,
y únicamente si la cronología lo permite. También puede registrarse «No hubo
reingreso físico». Desde un movimiento registrado se puede abrir otra vista previa
para revisar esa decisión, sin modificar sus datos documentales originales.

## Cronología y revisión

La conciliación reconstruye desde la cantidad original del último Recontar e
intercala los deltas de Sumar/Restar y los movimientos posteriores, ordenados por
su instante real. No vuelve a descontar del saldo ya ajustado. Los eventos
anteriores al recuento quedan registrados como reflejados físicamente.

Cuando un conteo antiguo carece de evento de recuento, se captura una referencia
solo si su timestamp y la cantidad se pueden verificar con el historial existente.
Si faltan datos o existe una operación antigua que no se puede reconstruir con
seguridad, se conserva la existencia y se solicita revisión o un nuevo recuento.

Las comparaciones usan segundos, aunque las operaciones originales conserven sus
milisegundos. Una coincidencia entre importación y operación manual en el mismo
segundo queda para revisión. También se revisan ventas y devoluciones simultáneas
si el orden podría importar. No se usa el orden de las filas para resolverlas.

Si el conjunto de movimientos de un producto produce un saldo negativo intermedio,
ese conjunto queda para revisión. Cuando la cronología manual por sí sola tiene
un saldo válido, la vista previa muestra la suspensión de sus ajustes importados
previos y el saldo manual correspondiente: solo se guarda tras confirmación. Esto
evita conservar arbitrariamente el descuento del archivo que llegó primero.
Si tampoco es posible reconstruir un saldo manual seguro, se conserva la cantidad
actual y se exige revisión física; no se inventa un saldo. Los cambios de estado
de movimientos anteriores y los cambios totales se muestran en la vista previa.

Una operación manual que convertiría movimientos aplicados en casos ambiguos se
bloquea, sin guardar una corrección automática oculta. Recontar establece una nueva
referencia y permite resolver movimientos anteriores ya reflejados físicamente.

## Fechas y zona horaria

La sugerencia inicial usa la zona del navegador, pero requiere confirmación. No se
asume UTC ni la zona del dispositivo al convertir un Excel. Se conservan por
movimiento fecha local, hora local, zona IANA e instante ISO normalizado, además de
la fecha de importación. La zona queda bloqueada después de importar movimientos.

La conversión usa las reglas IANA disponibles en `Intl` del navegador y comprueba
las posibles compensaciones de horario. Las horas locales duplicadas o inexistentes
por cambios de horario se rechazan para revisión. Las fechas históricas sin offset
o zona explícita no se reinterpretan. Para zonas con cambios legales recientes,
el navegador debe tener su base de zonas horarias actualizada.

## Archivos y pruebas

- `movement-time.ts`: conversión y validación temporal.
- `movement-import.ts`: lector de celdas y errores por fila.
- `imported-movements.ts`: identidad, conciliación, vista previa y auditoría.
- `inventory.ts`: modelos y compatibilidad de JSON.
- `database.ts`: transacción existente y revisión de escritura.
- Controlador y vistas de inventario: carga de archivos, vista previa, confirmación,
  pendientes e historial por producto.
- `imported-movements.spec.ts`: los diez casos solicitados, cronología, claves,
  conflictos, horarios y archivos .xlsx generados.
- `movements.svelte.spec.ts`: persistencia, rollback, pestañas y flujo de interfaz.

No se publica ni se despliega automáticamente. La validación usa inventarios de
prueba aislados y archivos generados; no se ha accedido a los datos reales de los
navegadores de los usuarios.
