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

1. Ajusta la variable `BASE_PATH` si tu repositorio no está en la raíz de GitHub Pages:

```bash
BASE_PATH=/matre_inv/ bun run build
```

2. Publica la carpeta `build` en GitHub Pages.
3. La aplicación no almacena datos sensibles ni catálogos reales en el repositorio; los inventarios se importan o se generan localmente desde el navegador.

