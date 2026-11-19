# Core foundations

`waffle_core` exposes JavaScript-compatible binary64 operations, RNG streams,
ordered JSON and SHA-256. Consumers should link the target to inherit its C++20
and floating-point settings. The GameState RNG has five advancing seeds and
`baseSeed` records the starting seed. The standalone `create_rng` has its own seed.
The advancing seeds and the Mulberry32 mix use uint32 arithmetic. Each draw wraps the stored seed modulo 2^32 before mixing.

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

## Deterministic math

Use `waffle::core::js` from `core/js_math.hpp` for deterministic binary64
math. Pass operands in their JavaScript order. The implementation requires the
core floating-point flags, round-to-nearest, and gradual underflow. It returns
the canonical quiet NaN for ECMAScript NaN results and preserves signed zero.
`hypot` takes the two operands used by the game. `sqrt` uses IEEE 754 square root.
The `core_layering` CTest checks for platform transcendental calls in `core`,
`sim`, and `timegraph`.

| Function | Browser use |
| --- | --- |
| `pow` | Chaos growth (`**`), card multiplier powers, map geometry and annealing, and timegraph step sizes. |
| `exp` | Biome-clustering acceptance and regional map anchor weights. |
| `sin`, `cos` | Regional map borders, foliage, terrain and direction anchors. |
| `atan2` | Terrain angles and regional names. |
| `hypot` | Regional distances and Vassal route costs. |
| `sqrt` | Region-count scaling for Vassal route costs. |
| `log10` | Timegraph axis step sizes. |
| `log` | The `log10` kernel and browser sun/moon animation decay. |

The `core_js_math_vectors` CTest reads checked-in hex binary64 operands and
results. The reference is Node v24.15.0, V8 13.6.233.17-node.48, Windows x64.
Regenerate from the repository root with that Node build.

```powershell
node native/src/tests/vectors/generate-js-math-vectors.mjs
```

Node 24.15.0 defaults to platform `std::pow` with ECMAScript special cases.
The generator also runs Node with `--no-use-std-math-pow` to obtain the fdlibm
column and checks that `Math.pow` and `**` agree for both backends. Portable
`js::pow` matches fdlibm bit-for-bit in all 44,096 cases. It differs from the
default Windows Node output in 913 cases (2.0705%), each by one ULP. The test
requires exact fdlibm bits and allows one ULP against the default column for
same-sign finite results. The other eight functions match default Node
bit-for-bit. NaN payloads from Node are recorded as the canonical quiet NaN.
[V8 pow backend selection](https://github.com/nodejs/node/blob/v24.15.0/deps/v8/src/numbers/ieee754.cc).

To compile and link the same core test executable for Android arm64 API 31,
set `$ndk` to the root of the cached NDK r30 installation and run from the
repository root.

```powershell
. native/tools/env.ps1
Set-Location native
cmake --preset android --toolchain "$ndk/build/cmake/android.toolchain.cmake"
cmake --build --preset android --target waffle_core_tests
```
