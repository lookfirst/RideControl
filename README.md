# Ride Control

Bike trainer control web app using Web Bluetooth. Tested with Wahoo KICKR Core 2 and Zwift Cog, with initial support for Zwift Click V2.

[Open Ride Control](https://ridecontrol.xyz)

## Features

- Welcomes first-time visitors with a concise introduction, open-source and local-data privacy details, a direct source-code link, and an optional “Don't show again” preference stored in the browser; the welcome screen remains available from the Ride Control footer link.
- Restores the paired-devices, terrain-workouts, or session-history side tray when the page reloads while that tray is open, and clears the remembered tray as soon as it closes. Pulsing indicators that communicate live connection or route state remain active even when Chromium reports a reduced-motion preference.
- Manages the smart trainer, heart rate monitor, and both Zwift Click V2 controllers independently from one paired-devices tray that slides smoothly into and out of view, with prominent pulsing status dots, one animated `Connecting...` label in device details and reconnect buttons, delayed recovery guidance for unusually long reconnects only while Chrome automatic reconnect is configured and a remembered device remains disconnected, and a green indicator once every paired device is ready; keeps the `+` controller above the `−` controller, automatically identifies each physical side, connects both controllers concurrently, routes mirrored Bluetooth notifications only to that side, glows only its row as it is pressed, and remembers its identity. Saved Click controllers connect together when a ride session starts or resumes, continuously retry after controller sleep, and disconnect as soon as the session ends to preserve their batteries; the paired-devices tray keeps them visibly saved while they are intentionally offline. The `−` controller's event session is proactively refreshed before its V2 timeout, detects either explicit session-expired response for immediate recovery, and serializes its intentional disconnect with the replacement connection so stale cleanup cannot tear down the new event stream. Its operational state is reflected in the connected-device count during that refresh, and a manual reconnect restarts a stale event session instead of trusting a lingering Bluetooth link. Click presses made while this panel is open stay in setup and do not shift the ride.
- Detects browsers outside the currently tested Chrome environment and replaces the pairing controls with a compatibility notice, while showing Chrome's automatic-reconnect setup steps directly in the paired-devices panel only when its persistent permission capability is unavailable and confirming when it is configured correctly.
- Shows each deployment's build time in the viewer's local timezone and links it to the GitHub pull request that produced the build, falling back to the closed pull-request list when no associated PR is available.
- Connects to compatible bike trainers and standard Bluetooth heart rate monitors through Web Bluetooth, remembers authorized devices, and restores the trainer, heart-rate monitor, and both Click controllers from one browser permission snapshot after a reload. The trainer and heart-rate monitor begin reconnecting immediately and independently; remembered Click controllers join those parallel attempts only during an active ride session. Trainers and active Click controllers keep advertisement discovery active through the GATT handshake so Chrome can react as soon as they broadcast, while heart-rate monitors use direct GATT retries because common HRMs do not reliably surface advertisements through Chrome's watcher. A shared coordinator deduplicates requests to the same physical device without letting a slow sensor block the others, and each device's service and notification setup stays sequential for reliable GATT communication.
- Shows live speed, power, cadence, heart rate, elapsed time, distance, and estimated calories, with MPH and KM/H display modes.
- Provides direct resistance control with buttons, a slider, and keyboard shortcuts with matching button feedback, shows smoothing progress inside the slider thumb, and records resistance changes alongside the other ride metrics.
- Offers original terrain workouts built as repeatable courses, with gentle, rolling, and climbing options and distinctive winding top-down route shapes. Courses explicitly support loops, point-to-point routes, and out-and-back routes; an out-and-back follows the supplied path to its turnaround, then reverses the same location and elevation data back to the start before repeating. Prairie Roll adds a non-intersecting, curving 15-mile loop of long, gradual rollers centered around 20% resistance and ranging from roughly 15–25%. Granite Switchbacks adds a sustained four-mile ascent whose hairpin corners briefly get steeper before immediately returning to the steady climbing grade, followed by a ridge and a descending sequence of five recovery rollers. Ridgeline Time Trial is a ten-mile out-and-back with a gradual five-mile, roughly 300-foot hillclimb to the turnaround and the identical terrain in reverse on the return. Every course begins flat without giving nearly level routes an unnecessarily long rollout: low-climb courses use about 0.4 km, moderate rollers use about 0.8 km, and climbing-focused courses retain a 1.5 km rollout. The course then automatically adjusts trainer resistance from the current grade, tracks the rider in compact, vertically aligned top-down and elevation views with a clearly labelled ridden-this-lap, ridden-this-trip, or ridden-this-route path and pulsing position markers while pedaling, and uses clear mid-contrast preview lines with a shared elevation scale so gentle rollers remain visibly low beside genuinely mountainous routes. It shows course distance progress to two decimal places alongside course percentage, current grade, and effective trainer resistance directly on the map, with grade and resistance values matching their graph colors, and derives cumulative ride climbing and downhill from course distance so those totals remain aligned with the advertised full-course climb. Elevation appears in feet with MPH or meters with KM/H, and terrain totals and progress are recorded with the session and preserved in saved history and TCX import/export. Restored or currently open sessions always resolve bundled workout IDs to the latest course definition, preventing older embedded map geometry from lingering after a course update. A workout can be selected before riding or planned while viewing a completed session; a newly planned workout immediately replaces the prior course on the dashboard at 0% progress without changing the completed ride's recorded data. It then remains locked from the moment riding begins until that session ends; definition refreshes for that same workout remain allowed without opening a path to switch courses. Workout terrain remains the base load when Zwift Click is paired, allowing virtual gears to scale that resistance without losing the grade-driven course behavior.
- Downloads terrain workouts as standard GPX 1.1 files containing geographic track points and elevation data, with names and descriptions readable by ordinary GPX tools and Ride Control extensions for stable ids, difficulty, baseline resistance, exact workout distance, saved starting location, and point-to-point, loop, or out-and-back course type. Valid GPX tracks or routes from other tools can be imported through the file picker or by dropping a GPX anywhere in the workout tray, then saved into a custom library on the current device; each newly imported workout appears immediately at the top and keeps that position after reloading. The tray also links to BikeGPX's collection of thousands of downloadable routes. An imported route's linked “Starts in” description opens an in-app map dialog beside the workout tray, fits its complete path with start and finish markers over an attributed OpenStreetMap base map, and continuously animates a standard bicycle marker along the route. Routes whose start and finish are genuinely near each other become loops automatically; other GPX routes remain one-way, start-to-finish courses without a generated return leg. The workout library filters immediately by course name or displayed difficulty, and every card keeps an up/down-arrow drag handle in the top-right corner; dragging moves the complete workout card strictly vertically, accepts a drop anywhere over another workout, and animates the surrounding cards out of the way to open a full-card-sized insertion space before saving the preferred order across browser reloads. The terrain tray remembers both that it was open and its workout-list scroll position across page reloads. Import, rename, and reorder feedback stays in a fixed bottom status area beside the selected-workout clearing action, preventing the workout list from shifting. Imported workout names can be clicked and renamed without changing the route's stable duplicate-detection identifier. Their top-down geometry is derived from latitude and longitude, terrain resistance is derived from elevation, and a route without its own description uses its first coordinate to label the starting city through a cached OpenStreetMap lookup, then saves that location directly with the workout so restoring or re-importing a Ride Control GPX does not repeat the request. Missing Ride Control metadata receives safe defaults. Stable workout ids—or a route fingerprint for third-party GPX—prevent built-in or previously imported workouts from being uploaded again. Imported entries can be removed, large tracks are sampled for efficient riding, and the geographic source model is ready for a future workout editor.
- Replaces direct resistance controls with a focused 1–24 virtual shifting interface whenever Zwift Click V2 is paired, including during terrain workouts, and restores the standard resistance control as soon as both controllers are forgotten. Shifting becomes available once the trainer and both controllers are connected, and the Click minus/plus buttons, on-screen controls, and keyboard down/up arrows step through the 24 physical combinations of 39/53-tooth chainrings and a 12-speed 12–24-tooth cassette, sorted by actual drivetrain ratio rather than equal percentage intervals. This gives gear 24 the full 53/12 top end for pushing on descents while retaining 39/24 as gear 1 for climbing. Holding a shift control continues shifting, terrain changes remain smoothly automated underneath the selected gear, and sessions record both the selected gear and applied trainer resistance.
- Automatically records while pedaling, auto-pauses during inactivity, supports manual pause and resume, and allows a session to end at any time—even before trainer data arrives. Finishing a ride smoothly returns a connected trainer to 10% resistance; if it is disconnected, 10% is remembered and applied when it reconnects.
- Tracks complete time-series data plus averages and maximums for power, cadence, heart rate, speed, resistance, and virtual gear, with large, high-visibility numbers in space-efficient live metric and ride-summary cards, oversized numeric ride totals with subdued unit labels, and focused or combined chart views with subtle separator bands between stacked metrics. Workout grade and elevation are graphed in their own distinct colors, resistance remains visible alongside gear during virtual shifting, and the gear graph stays hidden outside gear mode unless the session contains recorded gear data. The larger chart tabs distribute across the complete chart width. Workout elevation is recorded across the entire ride, so the course profile repeats in the graph for every completed loop.
- Lets riders explicitly save a completed session or end it without saving, while keeping start-new and continue-session choices to two clear, context-aware actions; saved sessions use browser-managed IndexedDB storage with optional comments and ride feeling, and persistent browser storage is requested when supported.
- Opens saved rides from the dashboard's Sessions button and organizes them by local date and time in a slide-out Sessions tray with a compact inline session count, clear date ranges for rides that span midnight, paginated loading, detailed metrics and charts, keyboard navigation with grouped shortcut help, and permanent deletion. The tray restores the selected session, the session-list scroll position, and each session's independent detail-pane scroll position after a page reload, falling back to the newest available session when a remembered ride no longer exists.
- Downloads saved rides as Strava-compatible TCX files, including timestamps, distance, speed, power, cadence, heart rate, resistance or virtual gear, terrain workout metadata and elevation samples, calories, ride feeling, comments, and a unique Ride Control session identifier for reliable duplicate detection.
- Imports an individual TCX file or every TCX file inside nested folders in a ZIP directly into local session history, preserves compatible ride data and Ride Control session identifiers, detects duplicates by identifier or stable ride data for legacy exports, and continues past individual invalid files in a batch; imported rides permanently retain their import timestamp and a subtle import icon, while only the latest batch remains highlighted until the history tray closes.
- Downloads every locally saved ride at once as a compressed ZIP containing a folder of individual TCX files, with collision-safe filenames when sessions share the same start time.
- Continues any saved session in a new unsaved copy while preserving its recorded time, distance, calories, samples, averages, maximums, and original start time.
- Protects recorded active rides with a browser confirmation before refresh or close, and presents the save workflow before starting or continuing another session.
- Includes contextual keyboard help for dashboard and history actions, including pausing, ending, starting, navigating, viewing history, and deleting sessions.
- Displays connection and application notices with a visible 15-second countdown and automatic dismissal.
- Keeps ride and session data local to the current browser profile; no account is required. When an imported GPX route has no description, only its first coordinate is sent to OpenStreetMap's Nominatim service to find a starting-city label, and that result is cached in the browser and stored with the workout. The resulting location sentence links to OpenStreetMap in a new tab, frames the complete route area, and marks the starting coordinate.

## Run

```bash
bun install
bun run dev
```

Open <http://localhost:4200> in current Chrome.

## Architecture

Ride session data is held in a per-app TanStack Store and changed through atomic domain actions.
The `useSession` adapter owns recording timers and durable browser persistence while exposing the
existing session controller API to the interface. Each Bluetooth hook exposes one explicit
connection phase instead of independently managed status flags. A single remembered-device catalog
loads browser-authorized devices once, then the trainer, heart-rate, and Click adapters start their
advertisement-driven reconnections together. One GATT coordinator deduplicates overlapping requests
to the same physical device while allowing the trainer, heart-rate monitor, and controllers to
connect in parallel. Each device sequences its own service setup, so a sleeping device cannot block
an awake one and concurrent ATT requests cannot fight over one connection.
Shared bounded connection probes, required service and notification
setup, persistent advertisement-driven wake detection, retry backoff, scheduling, and notification subscriptions live in
plain domain controllers, while device-specific adapters own their GATT services. Bluetooth objects
and timers stay outside shared application state. The application component coordinates focused
dashboard regions,
uses an explicit overlay state for mutually exclusive trays, renders every side tray through one
animated and accessible shell, and delegates save/discard/start/continue transitions to a
store-backed session workflow. Temporary form inputs remain local React state.
Terrain workouts are an independent course domain layered over session distance. Each bundled
course keeps its editable metadata, map geometry, elevation, and resistance baseline in an
individual JSON definition under `src/workouts`; shared factories derive the normalized runtime
course geometry and terrain behavior. Course geometry
produces grade, elevation, current and completed course counts, map position, and a bounded resistance
target. Virtual gearing applies the ordered ratios of the modeled 2×12 drivetrain to that target, so terrain
changes ramp smoothly while button-driven gear changes remain immediate. Recorded grade, resistance,
and elevation appear alongside the other session graphs for the full ride, and the course profile
repeats on every loop or out-and-back trip while point-to-point routes stop at their finish; route
progress, selected gear, and applied resistance stay portable in saved sessions and TCX files.
Shared domain utilities own unit conversions, numeric bounds, storage keys, metric presentation,
and repeated dialog and keyboard behavior so those rules stay consistent across views and exports.

## Deployment

Pull requests and pushes to `main` run the complete `bun run ci` suite in GitHub Actions. After
CI succeeds on `main`, a separate workflow runs `bun run build` and deploys the generated `dist`
directory to GitHub Pages at [ridecontrol.xyz](https://ridecontrol.xyz).

## Automatic reconnect

Ride Control currently tests Web Bluetooth only in desktop Chrome. Bluetooth does not work in
Brave.

Persistent Web Bluetooth permissions are disabled by default in current Chromium builds. To allow the app to reconnect after a page reload:

1. Open `chrome://flags/#enable-web-bluetooth-new-permissions-backend`.
2. Enable **Use the new permissions backend for Web Bluetooth**.
3. Relaunch Chrome and pair the device once more from the app.

The paired-devices panel detects Chrome's persistent reconnect capability and replaces these setup steps with a configured confirmation when it is available.

## License

Copyright (C) 2026 Public Profile.

Ride Control is licensed under version 3 of the GNU General Public License. See
[LICENSE](LICENSE) for the complete license terms.
