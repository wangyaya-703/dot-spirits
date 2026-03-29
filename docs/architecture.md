# Architecture

## Flow

1. `dot-codex run` starts a PTY-backed child process.
2. `CodexStateDetector` converts terminal output into state transitions.
3. `RenderController` maps state transitions to enter frames plus a hold frame.
4. `Quote0Client` pushes the corresponding PNG to the configured `IMAGE_API` task.
5. In `restore` mode, the controller restores a captured device image or a configured default image after completion.

## Conflict Model

- The project assumes a dedicated `IMAGE_API` task.
- The tool always resolves or uses a concrete `taskKey`.
- `refreshNow: true` means this tool can temporarily override the current visible content.
- device-native schedules or other services can still replace the displayed content later.

## Recovery Modes

- `hold`: keep the final state visible until something else replaces it.
- `restore`: wait for `restoreDelayMs`, then push the previously captured image or a fallback default PNG.
