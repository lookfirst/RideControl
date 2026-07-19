# Ride Control

Bike trainer control web app using Web Bluetooth. Tested with Wahoo KICKR Core 2 and Zwift Cog, with initial support for Zwift Click V2.

[Open Ride Control](https://ridecontrol.xyz)

## Features

- Welcomes first-time visitors with a concise introduction, open-source and local-data privacy details, a direct source-code link, and an optional “Don't show again” preference stored in the browser; the welcome screen remains available from the Ride Control footer link.
- Manages the smart trainer, heart rate monitor, and both Zwift Click V2 controllers independently from one paired-devices panel, with a blue activity indicator while devices connect and a green indicator once every paired device is ready; keeps the `+` controller above the `−` controller, automatically identifies each physical side, connects both controllers concurrently, routes mirrored Bluetooth notifications only to that side, glows only its row as it is pressed, remembers its identity, and continuously retries saved Click connections after a refresh or controller sleep; stalled attempts can be retried immediately, and Click presses made while this panel is open stay in setup and do not shift the ride.
- Connects to compatible bike trainers and standard Bluetooth heart rate monitors through Web Bluetooth, remembers authorized devices, and automatically reconnects when possible.
- Shows live speed, power, cadence, heart rate, elapsed time, distance, and estimated calories, with MPH and KM/H display modes.
- Provides direct resistance control with buttons, a slider, and keyboard shortcuts with matching button feedback, shows smoothing progress inside the slider thumb, and records resistance changes alongside the other ride metrics.
- Replaces direct resistance controls with a focused 1–24 virtual shifting interface whenever Zwift Click V2 is paired; the Click minus/plus buttons, on-screen controls, and keyboard down/up arrows make quick, three-point resistance changes with matching visual feedback, holding a shift control continues shifting, and sessions record and graph the selected gear instead of resistance.
- Automatically records while pedaling, auto-pauses during inactivity, supports manual pause and resume, and allows a session to end at any time—even before trainer data arrives.
- Tracks complete time-series data plus averages and maximums for power, cadence, heart rate, speed, and either resistance or virtual gear, with focused and combined chart views.
- Saves completed sessions to browser-managed IndexedDB storage, including optional comments and how the ride felt, and requests persistent browser storage when supported.
- Organizes saved sessions by local date and time in a slide-out history tray, with clear date ranges for rides that span midnight, paginated loading, detailed metrics and charts, keyboard navigation, and permanent deletion.
- Downloads saved rides as Strava-compatible TCX files, including timestamps, distance, speed, power, cadence, heart rate, resistance or virtual gear, calories, ride feeling, and comments for upload to Strava and other cycling services.
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

## Deployment

Pull requests and pushes to `main` run the complete `bun run ci` suite in GitHub Actions. After
CI succeeds on `main`, a separate workflow runs `bun run build` and deploys the generated `dist`
directory to GitHub Pages at [ridecontrol.xyz](https://ridecontrol.xyz).

## Automatic reconnect

Persistent Web Bluetooth permissions are disabled by default in current Chromium builds. To allow the app to reconnect after a page reload:

1. Open `chrome://flags/#enable-web-bluetooth-new-permissions-backend`.
2. Enable **Use the new permissions backend for Web Bluetooth**.
3. Relaunch Chrome and pair the device once more from the app.

## License

Copyright (C) 2026 Public Profile.

Ride Control is licensed under version 3 of the GNU General Public License. See
[LICENSE](LICENSE) for the complete license terms.
