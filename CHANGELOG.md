# Changelog — MATRE Inventario

Todos los cambios notables de la app. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [0.10.1] - 2026-11-11

### Cambiado

- Workflow de publicación trasladado a `publish.yml`, con nombre y grupo de concurrencia independientes para recuperar la publicación bloqueada antes de iniciar trabajos en GitHub Actions.
- Se conservan los pasos de compilación, la ruta de GitHub Pages y los permisos existentes.
- Versión visible 0.10.1 y caché PWA v17. Sin cambios en el modelo de inventario ni en las tablas de IndexedDB.

## [0.10.0] - 2026-11-11

### Añadido

- Fusión de uno o varios inventarios JSON de la misma sesión y ciclo, con vista previa obligatoria, comprobación de catálogos, deduplicación por identificadores y conservación de los archivos e historiales de origen.
- Conflictos persistentes para conteos independientes, incluso con cantidades iguales. Se resuelven con un nuevo recuento físico auditable; quedan fuera de las exportaciones definitivas mientras estén pendientes.
- Identificador de instancia de trabajo y de ciclo de conteo; respaldos JSON v5 compatibles con restauración de versiones 1–4.
- Historial administrativo de fusiones y pruebas de navegación, foco, fusión, persistencia y captura móvil/escritorio.

### Cambiado

- Menú principal reducido a Inicio, Inventario, Movimientos y Configuración. Configuración organiza General, Productos, Respaldos y Datos; artículos no encontrados quedan dentro de Inventario.
- Encabezado y navegación más compactos; buscador por encima de los controles de sesión en Inventario.
- La cantidad recibe enfoque y selección al abrir una tarjeta, después de su montaje y sin guardar ni desplazar automáticamente la página.
- La fusión reutiliza el motor existente de ventas y notas de crédito, conserva sus documentos y evita aplicar nuevamente movimientos compartidos.
- Las tablas de IndexedDB siguen en versión 1, sin reinicialización. Versión de la app 0.10.0 y caché PWA v16.

## [0.9.0] - 2026-11-11

### Añadido

- Sección Movimientos con importación independiente de ventas y notas de crédito desde archivos .xlsx, validación por fila y vista previa obligatoria antes de confirmar.
- Identificación por tipo, folio y clave principal exacta; conservación de ceros iniciales, detección de duplicados y conflictos sin sobrescribir los registros originales.
- Conciliación cronológica desde el último recuento físico, respetando ajustes manuales y movimientos atrasados. Productos Pendientes conservan sus movimientos sin modificar sus existencias.
- Confirmación explícita del reingreso físico de devoluciones, consulta de pendientes y auditoría de conciliaciones por producto.
- Zona horaria confirmada para el inventario, conversión de fechas y horas de Excel a instantes ISO y revisión de horas ambiguas o inexistentes.
- Respaldo JSON v4 para los nuevos datos, manteniendo lectura de versiones 1–3 y los timestamps históricos originales.
- Protección contra escrituras desde pestañas desactualizadas y pruebas de conciliación, archivos Excel, zonas horarias y persistencia atómica.

### Cambiado

- El motor preliminar de ventas se sustituye por reglas genéricas de movimientos, sin referencias a proveedores en el módulo nuevo.
- Las tablas existentes de IndexedDB permanecen en versión 1; los nuevos datos son campos opcionales de la sesión. No se recalcula ni se reinicializa el inventario al cargarlo.
- Versión de la app actualizada a 0.9.0 y caché PWA renovada a v15.

## [0.8.0] - 2026-11-11

### Añadido

- Operaciones manuales Sumar (+), Recontar y Restar (−), con resultado visible antes de confirmar y advertencia que bloquea cantidades negativas.
- Historial por producto con cantidades anterior, ingresada y resultante, fecha, hora y origen, conservado en IndexedDB y respaldos JSON compatibles con los inventarios existentes.
- Motor de conciliación para ventas normalizadas: vista previa sin modificar datos, confirmación explícita, prevención de duplicados y revisión de fechas ambiguas. La lectura de archivos SICAR y su interfaz quedan pendientes de verificar un reporte real.
- Pruebas de operaciones manuales, persistencia, historial y reglas de conciliación; documentación de arquitectura y datos necesarios para SICAR.
- Regla del proyecto para actualizar siempre la versión y el changelog junto con los cambios.

### Cambiado

- Recontar establece la referencia física, incluso en cero o sin conteo previo. Sumar y Restar requieren un primer recuento y conservan esa referencia sin inferir compras ni entradas.
- Voz y escaneo conservan su flujo de confirmación y ahora registran historial de recuentos.
- Versión visible actualizada a 0.8.0 y caché de la PWA renovada.

## [0.7.2] - 2026-11-08

### Quitado

- Todas las referencias visibles a SICAR en la app y en el README: la app ya no menciona ningún sistema externo.

### Cambiado

- El botón ahora dice "Exportar conteos" y exporta los conteos en formato genérico Clave/Cantidad.
- La columna "Existencia SICAR" ahora se llama "Existencia" en tarjetas, reportes y vista previa de importación.
- README corto y genérico, sin detalles del sistema anterior.

## [0.7.1] - 2026-11-08

### Mejorado

- Al tocar el micrófono junto a la búsqueda, el dictado empieza a escuchar de inmediato, sin segundo tap en el botón grande (que queda para detener o reintentar). Si el permiso de micrófono se niega, avisa en español y no reintenta en bucle.
- Al tocar el código de barras junto a la búsqueda, la cámara se abre de inmediato, sin segundo tap en el botón de escanear (que queda como reintento manual si la cámara falla). Si el permiso de cámara se niega, avisa en español.

## [0.7.0] - 2026-11-08

### Añadido

- Buscador estilo YouTube: el buscador original ahora tiene junto a la caja un botón de micrófono para dictar y un botón de código de barras para escanear; el panel se abre debajo de la barra y se cierra al confirmar o cancelar.

### Quitado

- Botón Escribir y la barra "Contar rápido": Escribir era lo mismo que el dictado por voz, y la barra ocupaba pantalla de más.

## [0.6.0] - 2026-11-08

### Añadido

- Contar rápido: una sola barra compacta con Voz, Código y Escribir; el panel solo se abre al usarlo y se cierra al confirmar o cancelar.
- El dictado por voz y el escaneo de código de barras respetan el filtro activo (Todos, Pendientes, Contados, Diferencias, Sin diferencias); si el producto está fuera del filtro, avisa y ofrece ver todos.
- Historial compartido de la sesión: solo los últimos 3 registros, con "Ver todos" para expandir.

### Corregido

- La cámara del escaneo de código de barras no abría tras permitir el permiso: el video se montaba después de pedir la cámara y se cerraba sola sin aviso.

## [0.5.0] - 2026-11-08

### Añadido

- Dictado por voz para contar inventario, con confirmación antes de guardar (PR #16, #17).
- Escanear código de barras con la cámara del celular (PR #20).
- Artículos no encontrados: registro separado, con estado "Pendiente de revisar", sin modificar el catálogo SICAR (PR #15).
- Renovación segura del inventario, reinicio de conteos y vista previa de restauración de respaldo JSON (PR #2).
- Actualización de catálogos SICAR y exportación segura de cantidades contadas (PR #14).

### Corregido

- Buscador específico: la coincidencia exacta va arriba y las variantes abajo como "Parecido · no exacto"; productos sin relación ya no aparecen como coincidencia (PR #19).
- Conteos móviles confiables e importación del catálogo SICAR (PR #1).

## [0.1.0] - 2026-11-05

### Añadido

- Primera versión del inventario: catálogo de productos, conteo físico, sesiones (inicio/pausa/finalizar) y respaldo en JSON.
- Refactor de la app en componentes Svelte enfocados (PR #3).
