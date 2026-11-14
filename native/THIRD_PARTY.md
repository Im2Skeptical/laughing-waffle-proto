# Native third-party notices

Versions below were checked against the publisher's release on 14 November 2026.
Full license texts are in the fetched sources (`native/build/<preset>/_deps` after configure)
and are not copied into git. Build output that ships `LatoLatin-Regular.ttf` also
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
| Lato Latin Regular | file shipped in RmlUi 6.3 `Samples/assets/LatoLatin-Regular.ttf` | copyright 2010-2015 Łukasz Dziedzic, reserved name Lato. http://www.latofonts.com/ | SIL Open Font License 1.1. Notice and license text: `RmlUi-6.3/Samples/assets/LICENSE.txt` in that archive. |

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

The window uses SDL's default 2D renderer (`SDL_CreateRenderer` with a null driver name).
That is an application renderer, not RmlUi's sample `SDL_GPU` or `SDL_GL3` backends.
Those sample backends also link SDL_image, which this bootstrap does not fetch.
RmlUi 6.3 deprecates its own `SDLrenderer` sample and points new work at SDL GPU.
This demo implements the geometry, texture, and scissor calls it needs and leaves
layers, filters, shaders, and clip masks unimplemented. It is not a phone-backend decision.
