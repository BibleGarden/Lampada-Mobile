# ADR 0024: Allocate a patch version for each build

Status: Accepted

## Context

The About screen displayed the fixed `1.0` Expo config version. The owner wants
the third version component to increase automatically for each build.
EAS remote auto-increment controls native build numbers, not the user-facing
version, and does not cover local iPhone builds.

## Decision

Keep `expo.version` in `app.json` as the source of the marketing version.
The npm iPhone, iOS, Android, EAS preview and EAS production build commands run
a shared patch allocator before compilation or upload. iPhone and EAS runtime
environment preflight must pass first. Local builds synchronize the resulting
config through Expo prebuild, including when native directories already exist.
About reads the installed native version, falling back to config on web and
using config explicitly in Expo Go to avoid displaying the host app version.

Preserve EAS remote native build-number management and the existing production
auto-increment. Do not derive marketing versions from remote build numbers or
increment on config evaluation, Metro startup or hot reload.

## Consequences

Version reservation precedes compilation so the version is baked into the
binary. Failed attempts consume numbers. Builds run sequentially from one
checkout; persist `app.json` in version control before changing checkouts or
machines. Direct native or Expo/EAS CLI builds bypass allocation. Major/minor
changes remain manual, and package metadata does not drive the app version.
No build profile, environment source or distribution method changes.
