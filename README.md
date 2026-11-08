# MATRE Inventario

App para contar inventario físico, rápido y sin papel. Para cualquier ferretería o negocio: importa tu catálogo, cuenta producto por producto y exporta el resultado.

## Cómo funciona

1. **Importa tu catálogo** — un Excel o CSV con clave, descripción y existencia.
2. **Cuenta** — busca por descripción, clave o código; o dicta por voz, o escanea el código de barras con la cámara.
3. **Confirma antes de guardar** — nada se guarda sin tu confirmación. Lo exacto aparece como *Coincide* y lo parecido como *Parecido · no exacto*.
4. **Exporta y respalda** — descarga tus conteos en Excel y un respaldo JSON.

## Lo que tiene

- Funciona sin internet después de la primera carga (PWA, instalable en el teléfono)
- Dictado por voz y escaneo de código de barras con la cámara
- Búsqueda que entiende medidas en palabras ("brocha de media pulgada")
- Filtros: Todos, Pendientes, Contados, Diferencias, Sin diferencias
- Artículos no encontrados: regístralos aparte para revisarlos después, sin ensuciar el conteo oficial
- Sesiones: comienza, pausa, reanuda y finaliza; el avance se ve en el tablero
- Modo claro y oscuro

## Tus datos

- Todo se guarda en tu dispositivo, no en un servidor.
- Haz respaldos JSON seguido, desde **Respaldo**.
- ⚠️ Nunca borres los datos de la app: solo borra la caché. Si borras los datos, pierdes el conteo. Con el respaldo JSON lo recuperas.

## Desarrollo

```bash
bun install
bun run dev
```

```bash
bun run check
bun run test
bun run build
```

Hecha con Svelte 5 + SvelteKit + TypeScript + Tailwind. Se publica sola en GitHub Pages al hacer push a `main`.

Ver cambios en [CHANGELOG.md](CHANGELOG.md).
