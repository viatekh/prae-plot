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

**Fixtures** — a set of generic fixtures (PARs, profiles, fresnels, LED and
moving lights) is built in, so a plot can be started straight away; import GDTF
files when the exact modes, weight and power matter. Each fixture carries its
channel, patch, mode, purpose, colour, weight and power draw. Placing one can
auto-assign the next free DMX slot, and the patch can be recalculated for any
selection.

**Hanging positions** — a truss is a position. A fixture dropped on or near one
hangs on it, is given a unit number along it, and moves with it. Nothing is
typed in or kept in step by hand: membership and numbering come from where
things are (`src/lib/positions.ts`). A truss can carry a trim height and can
number from either end.

**Power** — distros with per-circuit ratings and phases. Loads roll up per
circuit, per phase and per distro, including distros fed from other distros over
power cables. Overloaded circuits are flagged.

**Layers** — visibility, locking and draw order, reorderable from the panel. A
locked layer still prints and still shows on screen; it just cannot be selected
or dragged. Deleting a layer keeps its items; they simply lose the assignment.

**View** — one panel for everything that affects what is drawn rather than what
exists: grid, snap, grid size, scale bar, channel numbers, DMX addresses,
unit numbers, colour, purpose, fixture labels, circuit references, universe
colours, cable labels and lengths,
position names and lengths, shape labels and device names. The settings persist
between sessions and seed the export, so a sheet matches the screen.

**Documents** — the three standard schedules, each the same rig sorted a
different way: the **instrument schedule** (by position and unit, the order it
is hung), the **channel hookup** (by channel, the order the desk sees it) and
the **patch sheet** (by universe and address, with free addresses and clashes
flagged). Plus the equipment list, cable schedule, power report, and network
and DMX topology. All viewable in the app and exportable as PDF. The patch also
exports as a CSV, one fixture per row, for a console or visualiser import.

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

Sheets are laid out the way a lighting plot traditionally is: a trim border
with zone references, a ranked pen table, and a strip down the right-hand edge
holding the key above the title block, with the drawing number in the bottom
corner. The drawing gets the full height of the sheet.

The key holds a symbol key (each fixture type with its count, wattage and
weight), a notation key, a cable key, a position summary (trim, units and load
per truss), rig totals and numbered general notes from the project settings.
Sections that will not fit a small sheet are left off whole.

Each fixture is annotated to a fixed label legend, explained by the notation
key: channel ringed above the symbol, unit number to its left, then
universe.address, colour and purpose beneath. Position names and shape labels
are placed after the line work, trying several spots and taking the first that
does not sit on a fixture, a truss or another label. Hanging positions print as
real truss with bracing; equipment racks print as line work so a mono copy
still reads.

Scale can be "Fill sheet" (the exact ratio that fits the frame), "Nearest
standard" (snapped down to a conventional scale, which leaves a margin), or a
fixed ratio. Export options cover paper size (A4–A1), orientation, scale, which annotations
to print (channel and unit numbers, addresses, colour, purpose, labels, cable
lengths), the
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
    plotVector.ts     vector plot renderer (scale, bounds, symbols, labels, key)
    positions.ts      hanging positions: which truss a fixture is on, unit numbers
    schedules.ts      rows for the instrument schedule, channel hookup and patch
    starterLibrary.ts built-in generic fixtures
    symbolGeometry.ts fixture symbol primitives, shared by both renderers
    pdfExport.ts      PDF documents: plot, schedules, equipment, cable, power, groups
    gdtf.ts           GDTF file parsing
  store/projectStore.ts   zustand store: project data, history, UI state
  types/index.ts          project model, cable and distro catalogues
```

## Drawing modes

A project is either a **scaled drawing** or a **freeform sketch**, chosen when
you create it and changeable in project settings.

In freeform, positions are arbitrary units rather than metres, and nothing that
would be measured off the drawing is shown or printed: no scale bar, no scale
ratio, no cursor coordinates, no truss lengths, no derived cable lengths. Sheets
fill the frame and print `NTS` in the title block with a "not to scale" stamp in
place of the scale bar. Lengths that are still real — a cable run, a fixture's
weight and power — are typed in, and the cable schedule builds its stock-length
recommendations from those, listing any run that still has no length.

## Editing

Rectangles, ellipses and trusses are dragged out to size (Shift squares a
shape and keeps a truss level or plumb); a plain click drops one at a default
size. Either way you are handed its label field. A line at the top of the
canvas says what the active tool expects next.

Space or Escape drops back to the select tool; Alt/Option-drag duplicates;
Alt-drag on empty space pans, as does the middle mouse button or the hand tool.
Arrow keys nudge the selection by 10 cm, or a grid square with Shift.
Ctrl/Cmd+A selects everything, Ctrl/Cmd+D duplicates, Ctrl/Cmd+0 zooms to fit
(also on the zoom control, bottom right). A single item dragged with grid snap
on lands on the grid; a group keeps its spacing. Undo covers every edit, with a
burst of typing collapsed into one step.

With several fixtures selected, Properties edits them together — purpose,
colour, rotation, layer — and renumbers their channels in hang order from a
starting number.

Text annotations are sized in centimetres of real space, so they scale with the
drawing rather than floating at a fixed screen size.

## Saving

`Save` downloads the project as JSON and bumps the version. The editor also
autosaves to `localStorage` every 30 seconds (and when the tab is hidden or
closed); the start screen offers to restore that snapshot, or to discard it.
