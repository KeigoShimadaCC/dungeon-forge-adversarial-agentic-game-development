# Changelog

Version: v003

## Implemented changes

- Implemented v003 tuned demo profile as a shorter one-floor balance pass.
- Preserved Smoke Bomb tactical clarity while adding a starting Potion to reduce sudden losses.
- Kept enemies Slime-only so the final demo isolates item clarity and completion reliability.

## Tests and evidence

- `pnpm test tests/version-profiles.test.ts tests/demo-loop.test.ts tests/tactical-items.test.ts`
- `pnpm run demo-loop -- --runs-root .`
- `pnpm run compare-versions -- --base v002 --target v003 --runs-root .`

## Invariants preserved

- GameEngine interface unchanged.
- Seed determinism and explicit terminal states preserved.
- Gameplay remains finite, turn-based, and text/ASCII-first.

## Residual risks

- v001 softlock/ABORTED paths may still appear on some seeds; v002 adds tactical escape without claiming full loop fixes.

## Status

Status: implemented
