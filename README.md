# MATRE Inventario

MATRE Inventario es una aplicación web estática y progresiva para llevar a cabo conteos físicos de inventario en MATRE Ferretería. Está diseñada para uso móvil, almacenamiento local y operación sin conexión después de la primera carga.

## Funcionalidades del MVP

- Dashboard con métricas del inventario
- Sesiones de inventario con estados activos, pausados y finalizados
- Búsqueda rápida por nombre, clave y código de barras
- Registro de cantidades físicas por producto
- Diferencias y alertas visuales
- Importación genérica de catálogo Excel/CSV
- Exportación de resultados a Excel
- Respaldos JSON locales
- Persistencia con IndexedDB
- Tema claro/oscuro y modo del sistema
- PWA con service worker
- Preparado para despliegue en GitHub Pages con `@sveltejs/adapter-static`

## Requisitos

- Bun
- Node.js moderno

## Desarrollo

```bash
bun install
bun run dev
```

## Verificación

```bash
bun run check
bun run test
bun run build
```

## Despliegue en GitHub Pages

El workflow de GitHub Actions publica automáticamente al hacer push a `main`.
Para este repositorio de proyecto, la compilación usa `/matre_inv` como ruta base;
en desarrollo local, la ruta base queda vacía.

```bash
bun run build
```

La salida estática se genera en `build`. Para probar localmente el build de Pages:

```bash
BASE_PATH=/matre_inv bun run build
bun run preview
```

La aplicación no almacena datos sensibles ni catálogos reales en el repositorio; los inventarios se importan o se generan localmente desde el navegador.
