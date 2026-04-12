# Contributing to Avocado

Thanks for your interest! A few notes before you open a PR.

## Development setup

```sh
pnpm install
pnpm run typecheck
pnpm run build
```

Run the playground app to see things end-to-end:

```sh
pnpm run playground
```

## Conventional commits

Releases are automated by [release-please](https://github.com/googleapis/release-please), which reads your commit messages to decide version bumps. Please follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add WebSocket transport
fix: avoid double-dispatch of sessionLost
docs: clarify peer-dep matrix
chore: bump truffle to 0.4.1
```

Breaking changes go in the footer:

```
feat: rename IPTYSession.exitCode to .exit

BREAKING CHANGE: `exitCode` is now `exit.code`. Update your consumers.
```

## Publishing

You don't. Merging to `main` opens a release-please PR. Merging *that* PR cuts a tag, and the `release-npm.yml` workflow publishes to npm via OIDC provenance. No npm tokens live anywhere in the repo.

## Coding standards

- TypeScript strict mode
- No `any` unless unavoidable — annotate the reason in a comment
- Event emitters carry typed event maps; don't leak raw Node `EventEmitter`
- Avoid `import`ing from subpaths in tests; import from the public subpath exports
