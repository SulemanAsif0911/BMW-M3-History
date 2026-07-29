# The M3 Lineage — a scroll-driven 3D archive

A single-page site built with **Three.js** (WebGL) and **GSAP ScrollTrigger**.
One fixed 3D stage sits behind the page; as you scroll, the camera flies a
low "drone" arc around each car while its parts are pulled into place from
far away, like a magnet snapping metal into shape.

## Structure

```
index.html            — page markup (hero + 4 chapters + footer)
styles.css            — design tokens (BMW-blue accent, tri-colour M rail)
main.js                — Three.js scene, GLTF loading, scroll choreography
assets/models/         — the 5 supplied .glb files (renamed, unmodified)
```

## Running it

Browsers block `fetch()` of local files and ES module imports over the
bare `file://` protocol, so you need to serve the folder over local HTTP —
opening `index.html` by double-click will not work. From inside this
folder, run any one of:

```bash
python3 -m http.server 8080      # then open http://localhost:8080
# or
npx serve .
```

Everything else — three.js, GSAP/ScrollTrigger, and the two Google Fonts —
loads from a CDN at runtime, so the machine opening the site needs an
internet connection.

## How the scroll choreography works

- **One fixed `<canvas>`** stays behind the whole page (`position: fixed`);
  the HTML above it scrolls normally. Only one WebGL context ever exists,
  which is the main reason there's no stutter switching between chapters.
- **Each car's parts** are captured from the model's own node hierarchy
  (up to ~34 groups, however the model was authored), scattered to random
  positions/rotations off-frame, then tweened back to their true, modeled
  transform as you scroll — the "magnet" assembly effect.
- **The camera** sweeps an arc (angle, radius, height) around the car in
  the same scroll-scrubbed timeline, so the whole vehicle reads front-to-
  back like a low drone pass.
- **A short flash** masks the instant the camera and model swap for the
  *next* chapter, so the cut between cars reads as a deliberate shot
  change rather than a pop.
- Only the **logo + first car** block the initial loading screen; the
  remaining three cars fetch in the background while you're still reading
  the first chapter.

## A note on file size and performance

The five supplied models total **~46 MB**, and the Competition Touring
model in particular carries 462 individual meshes / 85 materials. That's
a lot of geometry to hand a browser, especially over a slow connection or
on a low-powered device. The site is built to keep runtime performance
smooth regardless (single canvas, no shadows, capped device-pixel-ratio,
background-loading, an adaptive part cap for the assembly effect) — but
initial download time is still bound by those file sizes.

If you want it to feel even snappier, especially on mobile:
- Run the `.glb` files through **`gltf-transform`** or **`gltfpack`**
  with Draco/Meshopt compression and texture resizing/re-encoding to
  WebP — this can often cut file size by 60–90% with no visible
  difference. (The loader in `main.js` already has Draco and Meshopt
  decoders wired up, so compressed files will work without any code
  changes.)
- Serve the models with gzip/Brotli compression enabled on whatever
  host you deploy this to (most static hosts do this automatically).

## Content notes

Specs quoted in each chapter (power, 0–60, top speed, etc.) reflect
publicly documented figures for each car. The "AC Schnitzer Black
Edition" chapter is presented as an independent aftermarket street
tribute to the E46 GTR rather than an official BMW Motorsport product,
since it isn't a documented factory specification.
