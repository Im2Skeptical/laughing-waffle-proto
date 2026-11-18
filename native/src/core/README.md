# Core foundations

`waffle_core` exposes JavaScript-compatible binary64 operations, RNG streams,
ordered JSON and SHA-256. Consumers should link the target to inherit its C++20
and floating-point settings. The GameState RNG has five advancing seeds and
`baseSeed` records the starting seed. The standalone `create_rng` has its own seed.
The advancing seeds use binary64 addition. Only the PRNG working word wraps.

JSON strings use UTF-8. A lone UTF-16 surrogate reached through a JSON escape
is retained internally as WTF-8 and emitted using a Unicode escape. The
parser rejects ill-formed raw UTF-8. The corpus writer matches the reference
implementation's assignment into a fresh object, including its treatment of
`__proto__`, and emits array indices in numeric order before the UTF-16 key sort.

## Verification

The core CTests use checked-in Node vectors and one complete New Game snapshot.
From the repository root, regenerate those files and optionally capture all nine
reference checkpoints into the ignored build directory.

```powershell
node native/src/tests/vectors/generate-core-vectors.mjs
node native/src/tests/vectors/generate-core-vectors.mjs --full native/build/core-corpus
.\native\build\dev\src\core\waffle_core_tests.exe states native/build/core-corpus/core-states.json
.\native\build\optimized\src\core\waffle_core_tests.exe states native/build/core-corpus/core-states.json
```

The generator uses the browser's official replay and serialization helpers and
checks the captured states against the existing corpus hashes before writing
its fixtures. The C++ test compares the original `JSON.stringify` bytes and the
sorted-key SHA-256 for each snapshot. RNG vectors store a digest of each 1,000
draw batch's binary64 results plus the GameState RNG serialization at that point.
