# Native third-party notices

The bootstrap versions below were checked against the publishers' releases on
14 November 2026. License texts for fetched dependencies are in their sources
(`native/build/<preset>/_deps` after configure). The vendored math notices are
reproduced below. Build output that ships `LatoLatin-Regular.ttf` also
copies RmlUi's `Samples/assets/LICENSE.txt` beside it as `FONT-LICENSE.txt`.

| Piece | Version | Source | License |
| --- | --- | --- | --- |
| MSVC (host compiler, already installed) | 19.50.35730.0, toolset 14.50.35717, VS Build Tools 18.5.11723.231 | Visual Studio Build Tools at `C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools`. `vcvars64.bat` imported into the process only. | Microsoft Visual Studio license already on the machine. This bootstrap does not install it. Windows SDK reported by that environment: 10.0.26100.0. |
| CMake | 4.5.0 (12 Nov 2026) | https://cmake.org/download/ and https://github.com/Kitware/CMake/releases/tag/v4.5.0 | BSD-3-Clause. Zip sha256 `301b1728317ccd84e984b02e366a8293735bc5ac618757d3d8f58b578f062411` matches `cmake-4.5.0-SHA-256.txt` on cmake.org. |
| Ninja | 1.13.2 | https://github.com/ninja-build/ninja/releases/tag/v1.13.2 | Apache-2.0. `ninja-win.zip` sha256 `07fc8261b42b20e71d1720b39068c2e14ffcee6396b76fb7a795fb460b78dc65` computed from that asset. The release API did not publish a separate digest. |
| llvm-mingw (fallback only) | 20261104, LLVM 23.1.5 | https://github.com/mstorsjo/llvm-mingw/releases/tag/20261104 | Not used when MSVC is installed. Bootstrap downloads it only if `vswhere` finds no Visual Studio. LLVM is Apache-2.0 WITH LLVM-exception. GitHub asset digest for `llvm-mingw-20261104-ucrt-x86_64.zip` is sha256 `552191b5754c49a5a20723276a6fc56541ea1922c4c50b7b669022333fc1b40f`. This session did not need the zip. |
| SDL | 3.4.20 (3 Nov 2026), tag `release-3.4.20`, commit `f00dc919ca35b9756316e86c4777392de442f9b2` | https://github.com/libsdl-org/SDL/releases/tag/release-3.4.20 | Zlib. `SDL3-3.4.20.tar.gz` sha256 `f3bb06f55bed9557227a700af2ea62e49497ebdf58037732a731a5fb3ef8581f`. |
| FreeType | 2.15.0 (12 Oct 2026) | https://download.savannah.gnu.org/releases/freetype/freetype-2.15.0.tar.gz and https://lists.nongnu.org/archive/html/freetype/2026-10/msg00000.html | FreeType License (BSD-style) or GPL. This build uses the FreeType License terms. Published sha1 `a28dbab6c7dd2d49d2987cbd93f2d485ed888b34`. sha256 `9186627467a616d9a9e3e574748ac0c45fa77398e6364edef3041a8ba8d92f64`. Internal zlib is compiled in (`FT_DISABLE_ZLIB=TRUE` selects FreeType's bundled zlib). HarfBuzz, PNG, bzip2, and Brotli are off. |
| RmlUi | 6.3 (22 Aug 2026), tag `6.3`, commit `ba95ffe8bfb6370efb2cdcca927eaad4710c5413` | https://github.com/mikke89/RmlUi/releases/tag/6.3 | MIT. Tag archive sha256 `d977298bb6147610e5984d5db85ddf284020d655a8713913f6982074f1dbdede` computed from `https://github.com/mikke89/RmlUi/archive/refs/tags/6.3.tar.gz`. |
| stb_image | 2.30, commit `013ac3beddff3dbffafd5177e7972067cd2b5083` | https://github.com/nothings/stb/tree/013ac3beddff3dbffafd5177e7972067cd2b5083 | Dual MIT or public domain. This build uses the public-domain dedication. Commit archive `stb-013ac3be.tar.gz` sha256 `b01aa93e1a968aed55f43e072c98ee401d2f20e897aabdb1a166c7166886ed11`. |
| Lato Latin Regular | file shipped in RmlUi 6.3 `Samples/assets/LatoLatin-Regular.ttf` | copyright 2010-2015 Łukasz Dziedzic, reserved name Lato. http://www.latofonts.com/ | SIL Open Font License 1.1. Notice and license text: `RmlUi-6.3/Samples/assets/LICENSE.txt` in that archive. |

## V8 and fdlibm math

`native/src/core/js_math.cpp` ports the relevant fdlibm-derived functions from the
V8 13.6.233.17-node.48 sources shipped in Node v24.15.0. The two-argument
`hypot` port follows V8's math builtin. The code retains the SunSoft and V8
notices and uses C++20 binary64 bit operations. [V8 ieee754.cc](https://github.com/nodejs/node/blob/v24.15.0/deps/v8/src/base/ieee754.cc), [V8 math.tq](https://github.com/nodejs/node/blob/v24.15.0/deps/v8/src/builtins/math.tq), [V8 LICENSE](https://github.com/nodejs/node/blob/v24.15.0/deps/v8/LICENSE).

```text
Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.

Developed at SunSoft, a Sun Microsystems, Inc. business.
Permission to use, copy, modify, and distribute this
software is freely granted, provided that this notice
is preserved.

Copyright 2016 the V8 project authors. All rights reserved.
Copyright 2019 the V8 project authors. All rights reserved.

Copyright 2014, the V8 project authors. All rights reserved.
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above
      copyright notice, this list of conditions and the following
      disclaimer in the documentation and/or other materials provided
      with the distribution.
    * Neither the name of Google Inc. nor the names of its
      contributors may be used to endorse or promote products derived
      from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Android packaging pins (14 Nov 2026)

These are the project-local tools for the arm64 debug package. They are not a
device run, and they do not change the Windows compiler pin above. CMake 4.5.0
and Ninja 1.13.2 are the same Windows bootstrap pins, copied into this
checkout's `native/.tools` after `cmake --version` / `ninja --version` matched.

| Piece | Version | Source | Check |
| --- | --- | --- | --- |
| Eclipse Temurin JDK | 17.0.21+9 | https://adoptium.net/temurin/releases/?version=17 and the Adoptium API asset `OpenJDK17U-jdk_x64_windows_hotspot_17.0.21_9.zip` | sha256 `98518ecf554465057ee5509462631deeee374bc368c12a411d225cd29381f84b`. GNU GPL-2.0 with Classpath Exception. Android Gradle Plugin 8.7 requires JDK 17. |
| Android SDK Command-line Tools | 23.0, `commandlinetools-win-16111833_latest.zip` | https://dl.google.com/android/repository/repository2-1.xml package `cmdline-tools;23.0`, documented at https://developer.android.com/tools/sdkmanager | sha1 `57d04f2d75eb8e8fffc5000a987e5de4b5a63e9d`, size 154957218. Android SDK License. |
| Android SDK Platform | android-35 | Installed with that `sdkmanager` from the same Google repository (`platforms;android-35`). SDL 3.4.20's android-project compiles against API 35. | Repository package. License accepted only under `native/.tools/android-sdk/licenses`. |
| Android SDK Build-Tools | 35.0.0 | `build-tools;35.0.0` from the same `sdkmanager` repository. | Repository package. AGP 8.7.3 defaults to 34.0.0; `native/android/app/build.gradle` sets `buildToolsVersion "35.0.0"`. |
| Android NDK | r30 LTS, `30.0.16248370` | https://developer.android.com/ndk/downloads and https://dl.google.com/android/repository/android-ndk-r30-windows.zip | Published sha1 `9bf167a1985fa7d4a036186b78f702eab9179408`, size 727980788. Android SDK License (agreement text on that page is dated April 28, 2026). |
| Android Gradle Plugin | 8.7.3 | The pin in SDL 3.4.20 `android-project/build.gradle`. | Maven coordinate `com.android.tools.build:gradle:8.7.3`. |
| Gradle | 8.12 | The pin in SDL 3.4.20 `android-project/gradle/wrapper/gradle-wrapper.properties`. | Wrapper jar copied from that verified SDL archive. |
| SDL Android Java shell | 3.4.20 | `android-project` inside the pinned `SDL3-3.4.20.tar.gz`. | Activity subclass `org.waffle.nativedemo.WaffleActivity` loads `libSDL3.so` and `libmain.so`. |

`minSdk` is 31. The native compile uses `ANDROID_PLATFORM=android-31` and
`ANDROID_STL=c++_static`. `targetSdk` / `compileSdk` stay at 35 because that is
what the SDL 3.4.20 project requires. The debug APK is signed only with a
keystore generated under `native/.tools/android-debug.keystore` (alias
`androiddebugkey`). That is not a release or store credential.
