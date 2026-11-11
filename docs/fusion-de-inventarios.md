# Navegación, captura y fusión JSON — 0.10.0

## Navegación y captura

El menú principal contiene Inicio, Inventario, Movimientos y Configuración.
Configuración tiene General, Productos, Respaldos y Datos. El catálogo y las
herramientas de respaldo reutilizan sus componentes existentes; no se reemplazan
sus validaciones. Artículos no encontrados se consulta dentro de Inventario, con
sus sesiones anteriores y registros conservados.

El buscador aparece antes de los controles compactos de sesión. El formulario de
cantidad usa una acción Svelte que espera `tick`, enfoca con `preventScroll` y
selecciona el contenido. Se conserva `inputmode="decimal"`, el teclado físico y la
confirmación explícita; enfocar no ejecuta un conteo.

## Identificadores y compatibilidad

- Sesión: `session.id`, ya existente.
- Ciclo: `countEpochId`, opcional para sesiones anteriores. Las sesiones nuevas y
  los reinicios reciben uno nuevo; evita fusionar respaldos anteriores a un reinicio.
- Producto: ID y clave principal estables del catálogo compartido.
- Operación manual: ID existente, con instancia opcional en las nuevas operaciones.
- Movimiento importado: tupla de tipo, folio y clave del motor de movimientos.
- Dispositivo: `instanceId` local y `exportedBy` en el respaldo; no es autenticación.

Los respaldos nuevos usan JSON v5; se aceptan versiones 1–4 para restaurar y se
validan antes de fusionar. Una sesión antigua sin identificador de ciclo solo se
fusiona con la misma sesión también sin ciclo explícito. No se asigna una relación
artificial entre inventarios distintos. Para compartir trabajo hay que distribuir
primero un respaldo común. Igualdad de cantidades o fechas nunca demuestra que
las operaciones sean la misma.

Las claves, nombres, unidades, existencia de referencia e identificadores deben
ser compatibles. Una clave con otro ID se bloquea en lugar de reescribir los IDs de
sus historiales. Productos nuevos con IDs no ocupados pueden agregarse. Si catálogo
y sesión contienen dos estados incompatibles dentro de un mismo archivo, no se
selecciona el más reciente para la fusión. Restaurar conserva sus migraciones
anteriores como una acción separada y explícita.

## Motor de fusión

`inventory-merge.ts` construye una vista previa sin escribir en IndexedDB:

1. Valida sesión, ciclo, catálogos y documentos de cada archivo.
2. Compara cada ID con su contenido completo. Un ID repetido con otro contenido
   bloquea la fusión; no se sobrescriben operaciones.
3. Integra conteos de productos que solo se contaron en un dispositivo. Una historia
   que es una extensión verificable de otra puede integrarse sin sumar conteos.
4. Si hay dos ramas independientes del mismo producto, conserva la cantidad local
   como referencia no definitiva y marca un conflicto. En un lote de archivos se
   mantiene el estado local inicial, sin elegir el primer conteo que llegó.
5. Une ventas/devoluciones por sus IDs originales y usa `reconcileMovements`. No
   descuenta a partir de saldos ya ajustados. Discrepancias sobre reingreso físico
   generan revisión, sin elegir automáticamente una decisión.
6. Conserva las fuentes e historiales y genera un registro administrativo de fusión.

Se guardan `mergeSources`, `mergeConflicts` y `mergeHistory` como campos opcionales
de la sesión. Cada fuente contiene el respaldo original normalizado por las
migraciones existentes. Los archivos que ya contenían otras fuentes se aplanan:
los padres se conservan una vez y sus IDs quedan referenciados, sin copias recursivas.
Los historiales originales de operaciones manuales nunca se reescriben para formar
una rama artificial. Metadatos distintos de importación de un mismo documento
quedan conservados en las fuentes, aunque el registro operativo se deduplique.

Reimportar el mismo ID de respaldo con el mismo contenido no agrega otra fuente,
operación ni recibo. Si el contenido cambió, se bloquea. También se conservan los
artículos no encontrados, referencias físicas y auditorías previas; colisiones de
IDs con contenido distinto se rechazan.

## Conflictos y resolución

Un producto con `mergeConflictId` muestra Pendiente de revisión, no cuenta como
avance definitivo y se excluye de `createCountsExport`. Sumar y Restar se bloquean
para ese producto. La conciliación de ventas/devoluciones también espera el recuento.

Al registrar Recontar, se añade un evento nuevo con cantidad, timestamp y procedencia,
se conserva la historia anterior, se registra la resolución y se libera el producto.
La hora del dispositivo debe ser posterior a los eventos conocidos en conflicto.
El motor de movimientos utiliza esa nueva referencia física y no reaplica eventos
anteriores al recuento.

Una resolución puede regresar a otro dispositivo cuando incluye los IDs de toda
su historia conocida. Dos resoluciones independientes generan otro conflicto.
Un conteo antiguo sin IDs no se considera cubierto por una resolución únicamente
porque coincidan cantidad o fecha. Los archivos ambiguos se bloquean o se conservan
como conflictos, según corresponda, con explicación visible.

## Persistencia y publicación

No cambia la versión 1 ni las tablas `state` y `backups` de IndexedDB. No se ejecuta
una fusión o recalculación al cargar la aplicación. La instancia se conserva
localmente; restaurar un respaldo no adopta la identidad del dispositivo exportador.

La confirmación recalcula la fusión contra el estado actual y usa la revisión de
escritura existente. Si cambió otra pestaña, se rechaza el guardado. Estado y copia
local previa se escriben en la misma transacción; un fallo revierte ambos. No se
accede a datos reales del usuario durante las pruebas.

La conservación de fuentes aumenta el tamaño de los respaldos. Un fallo por falta
de espacio se informa y no deja una fusión parcial. Conviene exportar respaldos con
frecuencia y mantener actualizadas las pestañas que escriben en el inventario.

La publicación usa el workflow existente de GitHub Pages, después de pruebas de
lógica, navegador, persistencia y captura en distintos tamaños, revisión de Svelte,
formato, lint y compilación con `BASE_PATH=/matre_inv`.
