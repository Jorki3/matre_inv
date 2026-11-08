# Changelog — MATRE Inventario

Todos los cambios notables de la app. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

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
