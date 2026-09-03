# Run summary: the app lock

Date: 2026-08-30. The Pray SE simulator, iOS 26.5, UDID
`18FBF907-60BB-48EF-9BE8-1DB2767465F5`, a Debug build. Maestro 2.6.1.

All the flows were run in a row, in the order below: each next one relies on the
protection state left by the previous one.

```
maestro --device 18FBF907-60BB-48EF-9BE8-1DB2767465F5 test testing/e2e/<flow>.yaml
```

| Flow | Exit code |
| --- | --- |
| `ios-lock-001-disabled-by-default.yaml` | 0 |
| `ios-lock-002-enable-pin.yaml` | 0 |
| `ios-lock-003-wrong-and-correct-pin.yaml` | 0 |
| `ios-lock-004-change-pin.yaml` | 0 |
| `ios-lock-005-disable-pin.yaml` | 0 |
| `ios-lock-006-forgot-pin-prepare.yaml` | 0 |
| `ios-lock-006-forgot-pin-wipe.yaml` | 0 |
| `ios-lock-007-background-timeout.yaml` | 0 |

Local checks of the same tree:

| Command | Exit code | Result |
| --- | --- | --- |
| `npm run typecheck` | 0 | no errors |
| `npm test` | 0 | 86/86; not a single test for `lib/lock.ts` |

## Screenshots

| File | State |
| --- | --- |
| `lock-002-cold-start-locked.png` | a cold start with the six-digit PIN enabled: six dots, the content is hidden |
| `lock-003-wrong-pin-error.png` | a wrong code: the error message, the field is cleared, the lock screen is still there |
| `lock-005-settings-protection-off.png` | the settings after the protection was removed: the toggle is off, there is no code change row |
| `lock-006-empty-journal-after-wipe.png` | the journal after the wipe through "Forgot your PIN?": the empty state |

The bottom part of two screenshots is covered by the LogBox banner "Open debugger
to view warnings" - an artefact of the Debug build, absent in Release.
