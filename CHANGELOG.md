# Changelog — MATRE Inventario

Todos los cambios notables de la app. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

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
