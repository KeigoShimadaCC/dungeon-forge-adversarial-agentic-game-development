# Changelog

Version: v002

## Implemented changes

- Implemented v002 demo profile with a starting Smoke Bomb and Potion/Smoke Bomb evidence path.
- Added opening log guidance and inventory effect details so tactical item purpose is visible before use.
- Taught baseline policies to use Smoke Bombs when enemies are close so item use appears in traces.

## Tests and evidence

- `pnpm test tests/version-profiles.test.ts tests/demo-loop.test.ts tests/tactical-items.test.ts`
- `pnpm run demo-loop -- --runs-root . --versions v001,v002`
- `pnpm run compare-versions -- --base v001 --target v002 --runs-root .`

## Invariants preserved

- GameEngine interface unchanged.
- Seed determinism and explicit terminal states preserved.
- Gameplay remains finite, turn-based, and text/ASCII-first.

## Residual risks

- v001 softlock/ABORTED paths may still appear on some seeds; v002 adds tactical escape without claiming full loop fixes.

## Status

Status: implemented
