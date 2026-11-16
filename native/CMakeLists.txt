cmake_minimum_required(VERSION 3.28)

# llvm-mingw is opt-in. MSVC (or any compiler already on PATH) stays the default.
if(NOT CMAKE_CXX_COMPILER AND "$ENV{WAFFLE_TOOLCHAIN}" STREQUAL "llvm-mingw" AND EXISTS "${CMAKE_CURRENT_LIST_DIR}/.tools/llvm-mingw/bin/clang++.exe")
	set(CMAKE_C_COMPILER "${CMAKE_CURRENT_LIST_DIR}/.tools/llvm-mingw/bin/clang.exe" CACHE FILEPATH "C compiler" FORCE)
	set(CMAKE_CXX_COMPILER "${CMAKE_CURRENT_LIST_DIR}/.tools/llvm-mingw/bin/clang++.exe" CACHE FILEPATH "C++ compiler" FORCE)
	if(EXISTS "${CMAKE_CURRENT_LIST_DIR}/.tools/llvm-mingw/bin/windres.exe")
		set(CMAKE_RC_COMPILER "${CMAKE_CURRENT_LIST_DIR}/.tools/llvm-mingw/bin/windres.exe" CACHE FILEPATH "Resource compiler" FORCE)
	elseif(EXISTS "${CMAKE_CURRENT_LIST_DIR}/.tools/llvm-mingw/bin/llvm-windres.exe")
		set(CMAKE_RC_COMPILER "${CMAKE_CURRENT_LIST_DIR}/.tools/llvm-mingw/bin/llvm-windres.exe" CACHE FILEPATH "Resource compiler" FORCE)
	endif()
endif()

project(waffle_native LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
if(MSVC)
	add_compile_options(/utf-8)
endif()

if(POLICY CMP0135)
	cmake_policy(SET CMP0135 NEW)
endif()

if(ANDROID)
	# Static FreeType/RmlUi are archived into libmain.so.
	set(CMAKE_POSITION_INDEPENDENT_CODE ON)
endif()

include("${CMAKE_CURRENT_LIST_DIR}/cmake/dependencies.cmake")

add_library(waffle_demo_probe STATIC
	src/ui/demo_probe.cpp
	src/ui/demo_probe.hpp
)
target_link_libraries(waffle_demo_probe PUBLIC RmlUi::RmlUi)
target_include_directories(waffle_demo_probe PUBLIC src/ui)

if(ANDROID)
	# SDL's Android activity dlsyms SDL_main from libmain.so. The desktop
	# executables are host programs and are not part of the APK.
	add_library(main SHARED
		src/app/main.cpp
		src/app/sdl_rml_renderer.cpp
		src/app/sdl_rml_renderer.hpp
		src/app/sdl_asset_file.cpp
		src/app/sdl_asset_file.hpp
	)
	target_link_libraries(main PRIVATE waffle_demo_probe ${WAFFLE_SDL_TARGET})
	target_include_directories(main PRIVATE src/app)
	set_target_properties(main PROPERTIES
		CXX_VISIBILITY_PRESET default
		VISIBILITY_INLINES_HIDDEN OFF
	)
else()
	add_executable(waffle_native_headless
		src/tests/headless_rmlui_test.cpp
	)
	target_link_libraries(waffle_native_headless PRIVATE waffle_demo_probe)
	target_compile_definitions(waffle_native_headless PRIVATE
		"WAFFLE_DEMO_RML=\"${WAFFLE_RML_PATH}\""
		"WAFFLE_FONT_PATH=\"${WAFFLE_FONT_PATH}\""
	)

	add_executable(waffle_native_demo
		src/app/main.cpp
		src/app/sdl_rml_renderer.cpp
		src/app/sdl_rml_renderer.hpp
	)
	target_link_libraries(waffle_native_demo PRIVATE waffle_demo_probe ${WAFFLE_SDL_TARGET})
	target_include_directories(waffle_native_demo PRIVATE src/app)

	if(MINGW)
		target_link_options(waffle_native_headless PRIVATE -static)
		target_link_options(waffle_native_demo PRIVATE -static)
	endif()

	add_custom_command(TARGET waffle_native_demo POST_BUILD
		COMMAND "${CMAKE_COMMAND}" -E make_directory "$<TARGET_FILE_DIR:waffle_native_demo>/assets/ui"
		COMMAND "${CMAKE_COMMAND}" -E copy_if_different
			"${CMAKE_SOURCE_DIR}/assets/ui/demo.rml"
			"$<TARGET_FILE_DIR:waffle_native_demo>/assets/ui/demo.rml"
		COMMAND "${CMAKE_COMMAND}" -E copy_if_different
			"${WAFFLE_LATO_PATH}"
			"$<TARGET_FILE_DIR:waffle_native_demo>/assets/ui/LatoLatin-Regular.ttf"
		COMMAND "${CMAKE_COMMAND}" -E copy_if_different
			"${WAFFLE_FONT_LICENSE}"
			"$<TARGET_FILE_DIR:waffle_native_demo>/assets/ui/FONT-LICENSE.txt"
		VERBATIM
	)

	enable_testing()
	add_test(NAME headless_rmlui COMMAND waffle_native_headless)
	set_tests_properties(headless_rmlui PROPERTIES TIMEOUT 60)
	add_test(NAME headless_utf8_assets COMMAND waffle_native_headless --utf8-assets)
	set_tests_properties(headless_utf8_assets PROPERTIES TIMEOUT 60)
endif()
