# Contributing

Thank you for improving Agile Nuxt Edge Backend. Contributions should keep the
project focused on safe, single-server Nuxt/Nitro applications with a persistent
filesystem.

## Local setup

Requirements:

- Node.js 20 or newer
- pnpm 9 or newer

```bash
corepack enable
pnpm install
pnpm repo:check
```

Useful commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm pack:check
pnpm template:check
```

## Repository structure

- `packages/edge-db`: embedded database engine, storage, recovery, indexes, CLI.
- `packages/backend`: Nuxt module, Nitro handlers, auth, permissions, composables.
- `templates/agile-nuxt-fullstack`: private GitHub-only Nuxt starter.
- `examples`: focused configuration examples.
- `scripts`: publication and repository validation.

## Changesets

Add a Changeset for every user-visible package change:

```bash
pnpm changeset
```

Choose the affected packages and the correct semantic version bump. The private
quickstart template is ignored by Changesets.

## Pull requests

- Keep changes focused and explain behavioral or security tradeoffs.
- Add tests proportional to storage, query, auth, or HTTP risk.
- Preserve pure TypeScript operation and avoid native dependencies.
- Do not weaken persistent-filesystem, single-writer, query-limit, or field-security defaults.
- Run `pnpm repo:check` before requesting review.
- Update package and root documentation when public APIs or deployment behavior change.

## Adding examples

Examples should demonstrate one focused workflow, use safe permissions, and avoid
credentials. Add them under `examples/<name>` and link them from the relevant
README when they introduce a new supported pattern.

## Updating documentation

Keep claims precise. Do not describe this project as a PostgreSQL replacement,
distributed database, serverless database, or general SQL engine. Document
limitations and migration implications with every storage-format or security change.
