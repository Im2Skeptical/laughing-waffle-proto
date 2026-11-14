# Pinned from official release artifacts on 14 Nov 2026.
# SDL 3.4.20 source sha256 is the GitHub release asset digest.
# FreeType 2.15.0 sha1 a28dbab6c7dd2d49d2987cbd93f2d485ed888b34 is the
# checksum in the 12 Oct 2026 savannah announcement; sha256 below is of that tarball.
# RmlUi 6.3 tag commit ba95ffe8bfb6370efb2cdcca927eaad4710c5413.
# The GitHub tag archive sha256 was computed from that official URL.

include(FetchContent)

set(FETCHCONTENT_BASE_DIR "${CMAKE_BINARY_DIR}/_deps" CACHE PATH "Per-build fetched sources and objects" FORCE)

function(waffle_pinned_url out_var filename remote_url)
	set(local_path "${CMAKE_SOURCE_DIR}/.tools/cache/${filename}")
	if(EXISTS "${local_path}")
		file(TO_CMAKE_PATH "${local_path}" local_cmake)
		set(${out_var} "${local_cmake}" PARENT_SCOPE)
	else()
		set(${out_var} "${remote_url}" PARENT_SCOPE)
	endif()
endfunction()

waffle_pinned_url(WAFFLE_FREETYPE_URL "freetype-2.15.0.tar.gz" "https://download.savannah.gnu.org/releases/freetype/freetype-2.15.0.tar.gz")
waffle_pinned_url(WAFFLE_SDL_URL "SDL3-3.4.20.tar.gz" "https://github.com/libsdl-org/SDL/releases/download/release-3.4.20/SDL3-3.4.20.tar.gz")
waffle_pinned_url(WAFFLE_RMLUI_URL "RmlUi-6.3.tar.gz" "https://github.com/mikke89/RmlUi/archive/refs/tags/6.3.tar.gz")
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)

set(FT_DISABLE_ZLIB TRUE CACHE BOOL "" FORCE)
set(FT_DISABLE_BZIP2 TRUE CACHE BOOL "" FORCE)
set(FT_DISABLE_PNG TRUE CACHE BOOL "" FORCE)
set(FT_DISABLE_HARFBUZZ TRUE CACHE BOOL "" FORCE)
set(FT_DISABLE_BROTLI TRUE CACHE BOOL "" FORCE)
set(FT_DISABLE_HVF TRUE CACHE BOOL "" FORCE)
set(SKIP_INSTALL_ALL ON CACHE BOOL "" FORCE)
set(DISABLE_FORCE_DEBUG_POSTFIX ON CACHE BOOL "" FORCE)

FetchContent_Declare(freetype
	URL "${WAFFLE_FREETYPE_URL}"
	URL_HASH SHA256=9186627467a616d9a9e3e574748ac0c45fa77398e6364edef3041a8ba8d92f64
	DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
FetchContent_MakeAvailable(freetype)
if(NOT TARGET Freetype::Freetype)
	add_library(Freetype::Freetype ALIAS freetype)
endif()

if(ANDROID)
	# SDLActivity loads libSDL3.so, then libmain.so. A static SDL archive would
	# drop JNI_OnLoad unless the link wrapped it in --whole-archive.
	set(SDL_SHARED ON CACHE BOOL "" FORCE)
	set(SDL_STATIC OFF CACHE BOOL "" FORCE)
else()
	set(SDL_SHARED OFF CACHE BOOL "" FORCE)
	set(SDL_STATIC ON CACHE BOOL "" FORCE)
endif()
set(SDL_TESTS OFF CACHE BOOL "" FORCE)
set(SDL_EXAMPLES OFF CACHE BOOL "" FORCE)
set(SDL_TEST_LIBRARY OFF CACHE BOOL "" FORCE)
set(SDL_INSTALL OFF CACHE BOOL "" FORCE)
set(SDL_INSTALL_TESTS OFF CACHE BOOL "" FORCE)

FetchContent_Declare(SDL3
	URL "${WAFFLE_SDL_URL}"
	URL_HASH SHA256=f3bb06f55bed9557227a700af2ea62e49497ebdf58037732a731a5fb3ef8581f
	DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
FetchContent_MakeAvailable(SDL3)
if(TARGET SDL3::SDL3-static)
	set(WAFFLE_SDL_TARGET SDL3::SDL3-static)
elseif(TARGET SDL3::SDL3)
	set(WAFFLE_SDL_TARGET SDL3::SDL3)
else()
	message(FATAL_ERROR "SDL 3.4.20 did not produce an SDL3 CMake target")
endif()

set(RMLUI_SAMPLES OFF CACHE BOOL "" FORCE)
set(RMLUI_LUA_BINDINGS OFF CACHE BOOL "" FORCE)
set(RMLUI_LOTTIE_PLUGIN OFF CACHE BOOL "" FORCE)
set(RMLUI_SVG_PLUGIN OFF CACHE BOOL "" FORCE)
set(RMLUI_HARFBUZZ_SAMPLE OFF CACHE BOOL "" FORCE)
set(RMLUI_PRECOMPILED_HEADERS OFF CACHE BOOL "" FORCE)
set(RMLUI_TRACY_PROFILING OFF CACHE BOOL "" FORCE)
set(RMLUI_FONT_ENGINE "freetype" CACHE STRING "" FORCE)
set(BUILD_TESTING OFF CACHE BOOL "" FORCE)

FetchContent_Declare(RmlUi
	URL "${WAFFLE_RMLUI_URL}"
	URL_HASH SHA256=d977298bb6147610e5984d5db85ddf284020d655a8713913f6982074f1dbdede
	DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
FetchContent_MakeAvailable(RmlUi)

set(WAFFLE_LATO_PATH "${rmlui_SOURCE_DIR}/Samples/assets/LatoLatin-Regular.ttf")
set(WAFFLE_FONT_LICENSE "${rmlui_SOURCE_DIR}/Samples/assets/LICENSE.txt")
if(NOT EXISTS "${WAFFLE_LATO_PATH}")
	message(FATAL_ERROR "Pinned RmlUi 6.3 archive is missing Samples/assets/LatoLatin-Regular.ttf")
endif()
file(TO_CMAKE_PATH "${WAFFLE_LATO_PATH}" WAFFLE_FONT_PATH)
file(TO_CMAKE_PATH "${CMAKE_SOURCE_DIR}/assets/ui/demo.rml" WAFFLE_RML_PATH)
