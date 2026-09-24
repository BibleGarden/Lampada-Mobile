# Reliability stress check — 2026-09-24

This check covers the repeat-use and background-work portions of
[stage 08](https://app.clickup.com/t/86cb8kdyx). It used the `Pray Smoke iPhone
17 Pro` simulator on iOS 26.5 and a local Lampada 1.0.24 Release build.
Measurements were taken on 2026-09-24 (Europe/Moscow). The starting source
was `main` at `6bef3c4`; the second build adds the `Flame` lifecycle fix.

## Repeat-use result

The [prepare flow](../evidence/2026-09-24-reliability/prepare.yaml) created a
60-minute session with one saved voice recording and text answer. The
[stress flow](../evidence/2026-09-24-reliability/stress.yaml) then opened the
answer and recordings sheets, played the recording twice, closed both sheets,
and saved the answer ten times in the same process. It finished the prayer and
reached Home. Both flows exited 0; the [full logs and measurements](../evidence/2026-09-24-reliability/)
are retained.

`vmmap -summary` measured a physical footprint of 173.9 MiB after preparation,
212.8 MiB after ten cycles, and 220.1 MiB after about three minutes on Home;
the observed peak was 228.1 MiB. The footprint was 219.0 MiB after a minute in
the background. The process did not crash or hang. One run shows warm-up and
eventual stabilization in this window; it cannot establish the absence of a
memory leak or a device-wide memory threshold.

## Background animation finding and fix

Before the fix, the app used 1.79 seconds of CPU during a settled 30-second
background interval from Home. A five-second process sample contained
`RNSkia::JsiSkPathBuilder::detach`: the flame continued creating paths while
the screen was hidden. `Flame` now cancels its Reanimated clock whenever
`AppState` leaves `active` and starts it again on activation.

After a fresh Release build, the full `ios-smoke-full.yaml` flow exited 0. A
matching background interval from Home used 0.82 seconds of CPU, with no Skia
path-builder frame in the five-second sample. The process resumed without
restarting; the flame region changed between screenshots taken one second
apart after activation. The reduction is a simulator observation, not a
physical-device power measurement; residual background CPU was not isolated.

One exploratory resume assertion failed because it expected Home while the
smoke flow had left the app on a journal card. The app resumed to that card;
returning to Home passed. The failed assertion is included in the evidence and
was not treated as an app defect.

## Limits and release follow-up

Instruments `Activity Monitor` reported that its service was unavailable on
this simulator. An `Allocations` probe did not complete and was terminated;
neither produced a usable trace. The paired iPhone 14 Plus was connected over
Wi-Fi and locked, so the current Release build could not be installed through
`npm run iphone` or profiled on the device. An incoming call during recording,
physical-device memory behavior, and microphone/player release under real
interruption remain for [stage 10](https://app.clickup.com/t/86cb8kdz2).
