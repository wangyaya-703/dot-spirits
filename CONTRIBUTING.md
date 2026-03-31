# Contributing

## Setup

1. Install Node.js 20 or newer.
2. Clone the repository.
3. Run `npm install`.
4. Copy `.env.example` to `.env` and fill in your own Dot credentials locally.

## Development

- Run `npm run lint` before committing.
- Run `npm test` before opening a PR.
- Keep secrets out of the repo. `.env` must stay untracked.
- Prefer small, reviewable commits.

## Pull requests

- Include a short summary of the user-visible change.
- Mention any Dot device assumptions or local setup needed to verify.
- Update `README.md` and `.env.example` if flags, env vars, or commands change.

## Scope

- The project currently targets macOS workflows and Quote/0 / Dot E-Ink devices.
- Keep the CLI deterministic and debuggable; avoid hidden background behavior unless documented.
