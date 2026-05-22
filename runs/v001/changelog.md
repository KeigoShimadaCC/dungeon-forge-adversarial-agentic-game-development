# Changelog

Version: v001

## Implemented changes

- Recorded the shallow baseline demo profile with two Slime/Potion-focused floors.
- Generated the default reviewer persona matrix and baseline balance batch from trace evidence.
- Kept the baseline intentionally shallow so v002 can respond to reviewer tactical/clarity critique.

## Tests and evidence

- `pnpm run demo-loop -- --runs-root . --versions v001`
- `pnpm run summarize-version -- --version v001 --runs-root .`

## Invariants preserved

- GameEngine interface unchanged.
- Seed determinism and explicit terminal states preserved.
- Gameplay remains finite, turn-based, and text/ASCII-first.

## Residual risks

- v001 softlock/ABORTED paths may still appear on some seeds; v002 adds tactical escape without claiming full loop fixes.

## Status

Status: implemented
