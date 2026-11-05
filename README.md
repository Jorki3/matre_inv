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

## Nuevo inventario y reinicio de conteos

Al finalizar se muestran los resultados, la exportación Excel/JSON y **Nuevo inventario**. Esta acción crea otra sesión con un identificador nuevo, conserva todo el catálogo SICAR y deja todos los productos pendientes. No comienza automáticamente: hay que pulsar **Comenzar**.

En **Configuración → Administración de datos**, **Reiniciar conteo** limpia las cantidades y fechas de conteo de la misma sesión abierta, conserva su identificador y todos los productos, claves, descripciones y existencias SICAR, y vuelve a **Sin iniciar**. Las sesiones finalizadas son de solo lectura: en ese caso se usa **Nuevo inventario**.

Ambas acciones abren una confirmación móvil con **Descargar respaldo actual JSON**. Se requiere marcar la casilla de consentimiento y confirmar; cancelar no cambia datos. La sesión anterior se archiva en IndexedDB dentro de la misma transacción que guarda el cambio, sin borrar respaldos anteriores. Si falla el almacenamiento, se conservan los datos originales y se muestra el error dentro del diálogo.

## Transferir el trabajo entre Android y PC

1. Desde **Configuración → Respaldos** o **Respaldo**, pulsa **Exportar respaldo JSON**. También está disponible al consultar los resultados finales. El nombre será `MATRE_Inventario_AAAA-MM-DD.json`, usando la fecha del dispositivo.
2. En Android, comprueba el archivo en Descargas y compártelo con tu PC por el medio que prefieras. El archivo puede contener datos reales: no lo agregues al repositorio ni a un PR.
3. En la PC, abre MATRE Inventario y elige **Importar respaldo JSON**. Selecciona el archivo descargado.
4. Revisa la vista previa: productos, contados, pendientes, fecha, versión y estado de sesión. Si ya hay datos locales, se indica cuántos serán reemplazados. Puedes descargar un respaldo de esos datos antes de continuar.
5. Marca la confirmación y pulsa **Confirmar restauración**. Catálogo, cantidades (incluido cero), fechas, estados y datos adicionales se restauran juntos. Si la sesión estaba En curso puedes seguir contando; si estaba Pausada, pulsa Reanudar; si estaba Finalizada, se conserva bloqueada.
6. Recarga para comprobar que el trabajo sigue disponible. Para volver a contar todo, usa **Nuevo inventario** después de finalizar o **Reiniciar conteo** en una sesión abierta.

Los respaldos nuevos mantienen el formato 2 y añaden explícitamente el estado derivado de cada producto; se aceptan formatos 1 y 2. No se requiere servidor ni se implementa sincronización automática. Cada navegador/dispositivo conserva su propia base local; exportar un archivo sigue siendo necesario para recuperar el trabajo si se borra el almacenamiento del navegador.

La prueba móvil `scripts/mobile-smoke.mjs` también verifica nuevo inventario, reinicio, cancelaciones, descarga previa y transferencia del JSON a otro contexto de navegador con IndexedDB vacío. Las pruebas de navegador restauran 500 conteos de un catálogo de 2,401 productos y comprueban que un fallo de almacenamiento no deja cambios parciales.

## Organización de la interfaz

`src/routes/+page.svelte` solo monta `InventoryApp`. En `src/lib/components/inventory/`, `InventoryApp.svelte` reúne la navegación, las vistas y los elementos compartidos:

- `DashboardView`, `InventoryView`, `CatalogView`, `BackupView` y `SettingsView` representan cada pantalla.
- `SessionControls`, `ProductSearch`, `ProductCard` y `CatalogImportPreview` separan el conteo y la importación.
- `BackupActions`, `DataActionDialog`, `StorageRecovery`, `AppHeader`, `AppNavigation` y `AppStatus` contienen la interfaz compartida.
- `inventory-controller.svelte.ts` crea el estado reactivo por instancia y centraliza las acciones de persistencia, sesiones, importación y exportación. Las vistas reciben ese controlador; el diálogo gestiona su propio comportamiento de DOM.
- `inventory-ui.ts` define las opciones de navegación, filtros y tipos de las acciones de confirmación. Las reglas del inventario y el acceso a IndexedDB permanecen en `src/lib/inventory.ts` y `src/lib/database.ts`.

## Catálogo SICAR: actualización y exportación de conteos

La importación reconoce equivalentes de **Clave**, **Clave alterna**, **Producto / Descripción**, **Existencia actual**, **Categoría / Departamento** y **Unidad de medida**, sin distinguir mayúsculas, acentos o espacios. Categoría y unidad son opcionales; se conservan en IndexedDB y JSON y pueden consultarse al expandir la tarjeta. La clave alterna sigue siendo un identificador del mismo producto: no genera otro artículo y no se detectan automáticamente columnas de código de barras como clave alterna. Los respaldos antiguos mantienen su migración compatible.

En **Productos → Importar catálogo**, revisa las asignaciones detectadas y corrígelas manualmente si hace falta. Los encabezados varían entre versiones de SICAR; se usa la primera hoja y la primera fila como encabezados. La vista previa muestra nuevos, actualizaciones, duplicados y errores antes de guardar. Se han probado archivos XLS y XLSX con 2,401 productos.

Hay tres modos:

- **Agregar solo claves nuevas:** omite claves ya presentes y no altera sus datos ni conteos.
- **Actualizar catálogo conservando conteos:** actualiza descripción, existencia SICAR y campos opcionales asignados para las claves coincidentes; conserva identificador, cantidad física, fecha de conteo, notas y datos comerciales. Agrega claves nuevas y mantiene los productos ausentes del archivo. Si un campo opcional no está asignado se conserva el valor anterior; si está asignado y vacío se limpia. Cambiar la existencia SICAR recalcula las diferencias, sin cambiar la cantidad física.
- **Reemplazar catálogo y conteos:** requiere confirmación y deja pendientes los productos del archivo. Es el modo requerido para sustituir un catálogo de demostración sin mezclarlo con productos reales.

Una sesión abierta muestra advertencia y pide confirmación antes de importar. Actualizar claves existentes también exige confirmación. Cuando ya hay productos se conserva una copia local previa en la misma transacción de IndexedDB. Una sesión finalizada sigue bloqueando cambios en su catálogo.

**Exportar para SICAR** es una descarga independiente del reporte Excel general. Produce un `.xlsx` con únicamente las columnas **Clave** (principal, como texto) y **Cantidad** (física, numérica). Solo incluye productos con marca de conteo, incluidos los ceros registrados. Los pendientes se excluyen y, si existen, se advierte y solicita confirmación antes de descargar. Sin conteos registrados, la acción permanece deshabilitada.

Este archivo es un formato provisional de intercambio: **no se ha validado contra una plantilla real de importación de SICAR y no garantiza que cualquier versión de SICAR lo acepte**. La estructura se concentra en `src/lib/sicar-export.ts` para ajustarla al recibir esa plantilla. La aplicación no envía archivos ni modifica existencias en SICAR.
