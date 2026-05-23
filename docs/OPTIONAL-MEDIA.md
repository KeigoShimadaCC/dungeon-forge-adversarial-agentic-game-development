# Optional Media

Phase 19C allows presentation experiments that can be ignored by the harness. Media can make a local demo richer, but it cannot become an input to gameplay, reviewer judgment, acceptance, or trace evidence.

## Manifest

Optional media is declared in `content/optional-media.json`.

Each presentation entry must include:

- `id`, `label`, and `description` for human review.
- `kind` as `image`, `audio`, or `video`.
- `required: false`.
- `versionIds` and/or `sceneIds` linking the presentation to known evidence or scenes.
- `assetPath` under local `media/`.
- `fallback` with `mode` as `ascii`, `text`, or `silent`.

ASCII and text fallbacks must include fallback text. Missing media files are allowed; the fallback is the authoritative presentation path when assets are absent.

## Validation

Run the advisory report:

```bash
pnpm run optional-media -- --format markdown
```

Check whether local assets exist without blocking on missing files:

```bash
pnpm run optional-media -- --check-files --out runs/optional-media/optional_media_report.json
```

The report blocks invalid metadata, required media, remote/absolute/parent-relative asset paths, invalid version IDs, and unknown scene IDs. It does not block because an optional asset file is missing.

## Allowed

- A title card for a generated static demo.
- An ambient loop for a local human-facing demo.
- A screenshot or video linked as supplemental presentation material.
- A fallback string that explains what to show when the asset is missing.

## Forbidden

- Image-only or audio-only gameplay.
- Required audio, voice, generated media, screenshots, video, or animation.
- Real-time or timing-dependent mechanics.
- Remote assets or external services required for play.
- Replacing traces, scorecards, reviews, or acceptance reports with screenshots or videos.

## Harness Contract

The engine and harness remain finite, turn-based, seedable, text/ASCII, serializable, and structured-action based. Agent play and acceptance checks must run on a machine with no media files. Gameplay claims remain trace-backed even when optional media exists.
