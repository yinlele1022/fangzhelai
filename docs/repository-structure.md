# Repository Structure

```text
apps/web/       Browser application and static assets
apps/server/    Flask application package and runtime entry point
content/        Canonical game content maintained by humans
var/            Local runtime data ignored by Git
scripts/        Development, generation, validation, and daemon scripts
tests/          Automated verification
docs/           Current documentation plus clearly marked history
examples/       Legacy integration examples retained for reference
archive/        Original pre-refactor source snapshots
tools/          Standalone team/Codex tools
```

The `archive/` directory protects original implementation material during the
restructure. It can be removed in a later, separately reviewed cleanup after the
new structure has been used successfully.

Design screenshots and other non-runtime visual references belong in
`docs/design/references/`, not in the repository root.
