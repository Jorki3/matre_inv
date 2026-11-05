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

## Conteo y protección de datos

Una instalación nueva empieza **Sin iniciar**, con el catálogo vacío. En **Productos**, selecciona un archivo `.xls`, `.xlsx` o `.csv` UTF-8: se lee la primera hoja con encabezados en su primera fila. Revisa la vista previa y asigna las columnas Clave, Descripción y Existencia SICAR; Clave alterna es opcional. Los alias son genéricos: **aún no se ha validado una plantilla oficial de SICAR**. Las columnas desconocidas requieren asignación manual. No se generan claves ni existencias faltantes.

La importación procesa el catálogo completo (probada con 2,401 registros en XLS y XLSX). Conserva los ceros iniciales que el archivo almacene como texto o formato de celda. No puede recuperar ceros que el archivo ya haya perdido. Se muestran errores y duplicados por clave principal; se omiten duplicados del archivo y del catálogo existente. La clave alterna solo identifica al mismo artículo. Al agregar claves nuevas se conservan los conteos existentes. Reemplazar el catálogo requiere confirmación y guarda una copia local previa de manera atómica; nunca se mezclan automáticamente artículos de demostración con los reales.

En **Inventario**, presiona **Comenzar** para registrar la fecha de inicio. Toca una tarjeta, captura la cantidad física (incluido cero) y pulsa **Guardar cantidad**. Puedes modificarla mientras la sesión esté En curso. La búsqueda y el filtro se conservan. Contados incluye todos los artículos registrados; Diferencias y Sin diferencias excluyen pendientes. La diferencia es cantidad física menos existencia SICAR.

Pausar bloquea la captura hasta Reanudar. Finalizar pide confirmación, registra la fecha y bloquea los conteos y las importaciones de catálogo; permite consultar y exportar resultados. Los cambios se muestran como guardados después de confirmar la escritura en IndexedDB. Recargar conserva la sesión y sus conteos.

Los respaldos JSON versión 1 siguen siendo legibles: `barcode` se conserva y también se interpreta como Clave alterna. Los respaldos nuevos usan versión 2. La migración no elimina la base; reconcilia los conteos de catálogo y sesión conservando el más reciente. Un respaldo con claves duplicadas, datos inválidos o una versión desconocida se rechaza sin sobrescribir el inventario. Si los datos locales no pueden migrarse, se ofrece descargar los originales para su revisión.

Restaurar un JSON requiere confirmación y conserva una copia local previa, descargable desde **Respaldo**. Esa copia sigue siendo local al navegador: exporta también JSON a un archivo antes de reemplazar datos, cambiar de dispositivo o limpiar el almacenamiento. Los reportes Excel dejan vacíos la cantidad física y la diferencia de productos pendientes. No incluyen actualizaciones directas de SICAR ni modifican precios o costos.

## Pruebas y revisión móvil

```bash
bun run check
bun run test
bun run build
BASE_PATH=/matre_inv bun run build
```

Las pruebas de navegador usan Chromium del sistema si existe `/usr/bin/chromium`. Puedes seleccionar otro ejecutable con `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`; sin ninguno, instala el Chromium compatible con Playwright mediante `bunx playwright install chromium`.

Para revisar desde un teléfono en tu misma red, ejecuta `bun run dev --host 0.0.0.0` en tu computadora y abre su IP y puerto de Vite desde el teléfono. En un entorno en la nube necesitas un acceso HTTPS autorizado al servidor; no uses la dirección de loopback del servidor en el teléfono. El modo PWA requiere producción y HTTPS (o localhost).

1. Importa un catálogo de prueba, verifica la vista previa y comienza la sesión.
2. Busca por clave alterna, toca una tarjeta y guarda cero. Comprueba Contados y Diferencias.
3. Modifica la cantidad para igualar SICAR y revisa Sin diferencias. Comprueba que la búsqueda sigue igual.
4. Pausa, recarga y verifica que la captura siga bloqueada; reanuda para editar.
5. Cancela una finalización y después confírmala. Recarga y verifica que las cantidades no se puedan cambiar.
6. Exporta Excel y JSON; restaura el JSON y verifica cantidades, fechas y estado. Descarga también la copia local previa.

Para revisar el sitio estático con la misma ruta de GitHub Pages, compila con `BASE_PATH=/matre_inv bun run build` y ejecuta `BASE_PATH=/matre_inv bun run preview --host 0.0.0.0`. No es necesario publicar en `main` para probarlo.

Con el sitio compilado en ejecución, `node scripts/mobile-smoke.mjs` verifica el flujo móvil completo con 2,401 productos en un contexto de navegador aislado. Para la ruta de Pages: `node scripts/mobile-smoke.mjs http://127.0.0.1:4173/matre_inv/`. Guarda una captura de revisión en la carpeta temporal del sistema (`/tmp/matre-mobile.png` en Linux).
