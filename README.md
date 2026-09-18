# Prae Plot

A browser-based stage lighting plot editor. Draw the venue, place fixtures from
GDTF files, patch them, run cable and power, then export the drawing and the
paperwork as PDFs.

Everything runs client-side — projects are plain JSON files you keep yourself.

## Running it

```bash
npm install
npm run dev      # dev server
npm run build    # typecheck + production build
npm run lint
```

## What it does

**Plot** — a Konva canvas in metres. Draw rectangles, ellipses, polygons, truss
bars and text; drop fixtures; place distros and devices; run cables with
waypoints that snap to whatever they connect to. A background image (a venue
plan, say) can be imported and calibrated against a known distance.

**Fixtures** — import GDTF files to build a library; each fixture keeps its
manufacturer, model, mode, channel count, weight and power draw. Placing one can
auto-assign the next free DMX slot, and the patch can be recalculated for any
selection.

**Power** — distros with per-circuit ratings and phases. Loads roll up per
circuit, per phase and per distro, including distros fed from other distros over
power cables. Overloaded circuits are flagged.

**Layers** — visibility, locking and draw order, reorderable from the panel. A
locked layer still prints and still shows on screen; it just cannot be selected
or dragged. Deleting a layer keeps its items; they simply lose the assignment.

**View** — one panel for everything that affects what is drawn rather than what
exists: grid, snap, grid size, scale bar, channel numbers, DMX addresses,
fixture labels, circuit references, universe colours, cable labels and lengths,
position names and lengths, shape labels and device names. The settings persist
between sessions and seed the export, so a sheet matches the screen.

**Documents** — patch sheet, equipment list, cable schedule, power report,
network and DMX topology, viewable in the app and exportable as PDF.

## The plot PDF

The plot is **drawn as vectors**, not screenshotted off the canvas. The exporter
reads the project data and emits PDF primitives, which means the drawing:

- is printed at a real architectural scale (1:25, 1:50, 1:100 …) with a graphic
  scale bar, rather than at whatever zoom the window happened to be at;
- keeps its aspect ratio, and is unaffected by pan, zoom or window size;
- carries no selection handles, rubber bands or cursor overlays;
- stays sharp at any zoom or print size;
- honours the layer selection, and can put each layer on its own page — all
  pages of a set share one scale and origin, so the sheets overlay;
- works whether or not the canvas is on screen.

Sheets are set to drawing conventions: a trim border with zone references
(A–F across, 1–4 down), a ranked pen table, a cell-grid title block carrying
the drawing number, revision, sheet count and scale, and a key column holding
the instrument summary, cable key, sheet data, north arrow and scale bar.
Hanging positions print as real truss with bracing and a name tag; channel
numbers sit in boxed tags; equipment racks print as line work so a mono copy
still reads.

Scale can be "Fill sheet" (the exact ratio that fits the frame), "Nearest
standard" (snapped down to a conventional scale, which leaves a margin), or a
fixed ratio. Export options cover paper size (A4–A1), orientation, scale, which annotations
to print (channel numbers, DMX addresses, fixture labels, cable lengths), the
background image, the grid, the key column and colour-by-layer. The export
dialog previews the actual PDF before you save it.

The reports are set like technical schedules — tracked small caps, hairline
rules, banded rows, right-aligned numerics, repeated headers and a sheet
reference in the footer.

Fixture symbol geometry lives in one place (`src/lib/symbolGeometry.ts`) and is
consumed by both the canvas and the PDF renderer, so what you draw is what
prints.

## Layout

```
src/
  components/
    canvas/      PlotCanvas — the Konva drawing surface
    panels/      left/right editor panels (fixtures, power, layers, …)
    documents/   on-screen report views
    shared/      export dialog, project info dialog
  lib/
    plotVector.ts     vector plot renderer (scale, bounds, symbols, legend)
    symbolGeometry.ts fixture symbol primitives, shared by both renderers
    pdfExport.ts      PDF documents: plot, patch, equipment, cable, power, groups
    gdtf.ts           GDTF file parsing
  store/projectStore.ts   zustand store: project data, history, UI state
  types/index.ts          project model, cable and distro catalogues
```

## Editing

Drawing tools place a shape and hand you its label field. Space or Escape drops
back to the select tool; Alt/Option-drag duplicates; Alt-drag on empty space
pans, as does the middle mouse button or the hand tool. Ctrl/Cmd+0 zooms to
fit, Ctrl/Cmd+D duplicates, and undo covers every edit, with a burst of typing
collapsed into one step.

Text annotations are sized in centimetres of real space, so they scale with the
drawing rather than floating at a fixed screen size.

## Saving

`Save` downloads the project as JSON and bumps the version. The editor also
autosaves to `localStorage` every 30 seconds (and when the tab is hidden or
closed); the start screen offers to restore that snapshot, or to discard it.
