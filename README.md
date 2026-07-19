# Ride Control

Bike trainer control web app using Web Bluetooth. Tested with Wahoo KICKR Core 2 and Zwift Cog, with initial support for Zwift Click V2.

[Open Ride Control](https://ridecontrol.xyz)

## Features

- Welcomes first-time visitors with a concise introduction, open-source and local-data privacy details, a direct source-code link, and an optional “Don't show again” preference stored in the browser; the welcome screen remains available from the Ride Control footer link.
- Manages the smart trainer, heart rate monitor, and both Zwift Click V2 controllers independently from one paired-devices tray that slides smoothly into and out of view, with blue pulsing dots and a consistent reconnecting status for controllers awaiting connection and a green indicator once every paired device is ready; keeps the `+` controller above the `−` controller, automatically identifies each physical side, connects both controllers concurrently, routes mirrored Bluetooth notifications only to that side, glows only its row as it is pressed, remembers its identity, continuously retries saved Click connections after a refresh or controller sleep, and keeps the sleeping-controller display stable between retry attempts; stalled attempts can be retried immediately, and Click presses made while this panel is open stay in setup and do not shift the ride.
- Detects browsers outside the currently tested Chrome environment and replaces the pairing controls with a compatibility notice, while showing Chrome's automatic-reconnect setup steps directly in the paired-devices panel only when its persistent permission capability is unavailable and confirming when it is configured correctly.
- Shows each deployment's build time in the viewer's local timezone and links it to the GitHub pull request that produced the build, falling back to the closed pull-request list when no associated PR is available.
- Connects to compatible bike trainers and standard Bluetooth heart rate monitors through Web Bluetooth, remembers authorized devices, and automatically reconnects when possible.
- Shows live speed, power, cadence, heart rate, elapsed time, distance, and estimated calories, with MPH and KM/H display modes.
- Provides direct resistance control with buttons, a slider, and keyboard shortcuts with matching button feedback, shows smoothing progress inside the slider thumb, and records resistance changes alongside the other ride metrics.
- Replaces direct resistance controls with a focused 1–24 virtual shifting interface whenever Zwift Click V2 is paired; shifting becomes available once the trainer and both controllers are connected, and the Click minus/plus buttons, on-screen controls, and keyboard down/up arrows then make quick, three-point resistance changes with matching visual feedback, holding a shift control continues shifting, and sessions record and graph the selected gear instead of resistance.
- Automatically records while pedaling, auto-pauses during inactivity, supports manual pause and resume, and allows a session to end at any time—even before trainer data arrives.
- Tracks complete time-series data plus averages and maximums for power, cadence, heart rate, speed, and either resistance or virtual gear, with large, high-visibility live metric cards, oversized numeric ride totals with subdued unit labels, and focused or combined chart views with subtle separator bands between stacked metrics.
- Lets riders explicitly save a completed session or end it without saving, while keeping start-new and continue-session choices to two clear, context-aware actions; saved sessions use browser-managed IndexedDB storage with optional comments and ride feeling, and persistent browser storage is requested when supported.
- Organizes saved sessions by local date and time in a slide-out history tray, with clear date ranges for rides that span midnight, paginated loading, detailed metrics and charts, keyboard navigation with grouped shortcut help, and permanent deletion.
- Downloads saved rides as Strava-compatible TCX files, including timestamps, distance, speed, power, cadence, heart rate, resistance or virtual gear, calories, ride feeling, comments, and a unique Ride Control session identifier for reliable duplicate detection.
- Imports an individual TCX file or every TCX file inside nested folders in a ZIP directly into local session history, preserves compatible ride data and Ride Control session identifiers, detects duplicates by identifier or stable ride data for legacy exports, and continues past individual invalid files in a batch; imported rides permanently retain their import timestamp and a subtle import icon, while only the latest batch remains highlighted until the history tray closes.
- Downloads every locally saved ride at once as a compressed ZIP containing a folder of individual TCX files, with collision-safe filenames when sessions share the same start time.
- Continues any saved session in a new unsaved copy while preserving its recorded time, distance, calories, samples, averages, maximums, and original start time.
- Protects recorded active rides with a browser confirmation before refresh or close, and presents the save workflow before starting or continuing another session.
- Includes contextual keyboard help for dashboard and history actions, including pausing, ending, starting, navigating, viewing history, and deleting sessions.
- Displays connection and application notices with a visible 15-second countdown and automatic dismissal.
- Keeps all ride data local to the current browser profile; no account or remote service is required.

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
connection phase instead of independently managed status flags. Shared reconnect scheduling and
notification subscriptions live in plain controllers, while device-specific adapters own GATT
setup for heart-rate monitors, trainers, and Click controllers. Bluetooth objects and timers stay
outside shared application state. The application component coordinates focused dashboard regions,
uses an explicit overlay state for mutually exclusive trays, renders every side tray through one
animated and accessible shell, and delegates save/discard/start/continue transitions to a
store-backed session workflow. Temporary form inputs remain local React state.
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
