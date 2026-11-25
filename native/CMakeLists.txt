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

if(NOT ANDROID)
	enable_testing()
endif()
add_subdirectory(src/core)
add_subdirectory(src/sim)
add_subdirectory(src/timegraph)
add_subdirectory(src/bench)

if(NOT ANDROID)
	add_executable(waffle_forecast_chart_test src/tests/forecast_chart_test.cpp src/ui/forecast_chart.cpp)
	target_link_libraries(waffle_forecast_chart_test PRIVATE waffle_timegraph)
	target_include_directories(waffle_forecast_chart_test PRIVATE src)
	target_compile_features(waffle_forecast_chart_test PRIVATE cxx_std_20)
	if(MINGW)
		target_link_options(waffle_forecast_chart_test PRIVATE -static)
	endif()
	add_test(NAME forecast_chart_envelopes COMMAND waffle_forecast_chart_test envelopes)
	add_test(NAME forecast_chart_chronicle COMMAND waffle_forecast_chart_test chronicle)
	add_test(NAME stage_parity COMMAND "${CMAKE_COMMAND}"
		"-Dparity=$<TARGET_FILE:waffle_parity>"
		"-Dfixture=${CMAKE_CURRENT_SOURCE_DIR}/reference/fixtures/stages/seed-1/1"
		"-Doutput_dir=${CMAKE_CURRENT_BINARY_DIR}"
		-P "${CMAKE_CURRENT_SOURCE_DIR}/src/tests/check_stage_cli.cmake")
	set_tests_properties(stage_parity PROPERTIES TIMEOUT 60)
	# The seed-1/1 manifest deduplicates both prelude endpoints with the clock's after file.
	set(prelude_fixture "${CMAKE_CURRENT_SOURCE_DIR}/reference/fixtures/stages/seed-1/1/after-advance_clock.json")
	add_test(NAME stage_parity_prelude COMMAND waffle_parity stage
		--stage prelude --before "${prelude_fixture}" --after "${prelude_fixture}")
	set_tests_properties(stage_parity_prelude PROPERTIES TIMEOUT 60)
endif()

include("${CMAKE_CURRENT_LIST_DIR}/cmake/dependencies.cmake")

add_library(waffle_demo_probe STATIC
	src/ui/demo_probe.cpp
	src/ui/demo_probe.hpp
)
target_link_libraries(waffle_demo_probe PUBLIC RmlUi::RmlUi)
target_include_directories(waffle_demo_probe PUBLIC src/ui)

set(WAFFLE_DEMO_SOURCES
	src/app/main.cpp
	src/app/demo_benchmark.cpp
	src/app/sdl_rml_renderer.cpp
)

set(WAFFLE_CONNECTED_SOURCES
	src/app/connected_art.cpp
	src/app/connected_controls.cpp
	src/app/connected_crest_art.cpp
	src/app/connected_crests.cpp
	src/app/connected_graph.cpp
	src/app/connected_life_view.cpp
	src/app/connected_map.cpp
	src/app/connected_map_art.cpp
	src/app/connected_atmosphere.cpp
	src/app/connected_map_roads.cpp
	src/app/connected_map_sites.cpp
	src/app/connected_terrain.cpp
	src/app/connected_main.cpp
	src/app/connected_save.cpp
	src/app/connected_session.cpp
	src/app/connected_settlement_view.cpp
	src/app/connected_shell.cpp
	src/app/connected_smoke.cpp
	src/app/connected_view.cpp
	src/app/sdl_asset_file.cpp
	src/app/sdl_rml_renderer.cpp
	src/ui/connected_model.cpp
	src/ui/crest_model.cpp
	src/ui/forecast_chart.cpp
	src/ui/life_map.cpp
	src/ui/settlement_model.cpp
)

if(ANDROID)
	# SDL's Android activity dlsyms SDL_main from libmain.so. The desktop
	# executables are host programs and are not part of the APK.
	add_library(waffle_native_game SHARED ${WAFFLE_CONNECTED_SOURCES})
	set_target_properties(waffle_native_game PROPERTIES
		OUTPUT_NAME main
		CXX_VISIBILITY_PRESET default
		VISIBILITY_INLINES_HIDDEN OFF
	)
	target_compile_definitions(waffle_native_game PRIVATE
		"WAFFLE_ART_ROOT=\"\""
		"WAFFLE_CONNECTED_RML=\"ui/connected.rml\""
		"WAFFLE_CONNECTED_FONT=\"ui/LatoLatin-Regular.ttf\""
		"WAFFLE_OPENING_CONFIG=\"game/opening.json\"")
else()
	add_executable(waffle_native_headless
		src/tests/headless_rmlui_test.cpp
	)
	target_link_libraries(waffle_native_headless PRIVATE waffle_demo_probe)
	target_compile_definitions(waffle_native_headless PRIVATE
		"WAFFLE_DEMO_RML=\"${WAFFLE_RML_PATH}\""
		"WAFFLE_FONT_PATH=\"${WAFFLE_FONT_PATH}\""
	)

	add_executable(waffle_native_demo ${WAFFLE_DEMO_SOURCES})
	target_link_libraries(waffle_native_demo PRIVATE waffle_demo_probe ${WAFFLE_SDL_TARGET} waffle_png_headers)
	target_compile_definitions(waffle_native_demo PRIVATE "WAFFLE_ART_ROOT=\"${CMAKE_CURRENT_LIST_DIR}/../\"")
	target_include_directories(waffle_native_demo PRIVATE src/app)

	if(WIN32)
		target_sources(waffle_native_demo PRIVATE src/app/demo_metrics_windows.cpp)
		target_link_libraries(waffle_native_demo PRIVATE psapi)
	endif()

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
	set_property(TARGET waffle_native_demo APPEND PROPERTY LINK_DEPENDS "${WAFFLE_RML_PATH}")

	add_test(NAME headless_rmlui COMMAND waffle_native_headless)
	set_tests_properties(headless_rmlui PROPERTIES TIMEOUT 60)
	add_test(NAME headless_utf8_assets COMMAND waffle_native_headless --utf8-assets)
	set_tests_properties(headless_utf8_assets PROPERTIES TIMEOUT 60)
	add_test(NAME headless_presentation_math COMMAND waffle_native_headless --math)
	set_tests_properties(headless_presentation_math PROPERTIES TIMEOUT 60)

	if(WIN32)
		add_executable(waffle_native_game ${WAFFLE_CONNECTED_SOURCES} src/app/demo_metrics_windows.cpp)
		target_link_libraries(waffle_native_game PRIVATE psapi)
		target_compile_definitions(waffle_native_game PRIVATE
			"WAFFLE_ART_ROOT=\"${CMAKE_CURRENT_LIST_DIR}/../\""
			"WAFFLE_CONNECTED_RML=\"${CMAKE_CURRENT_LIST_DIR}/assets/ui/connected.rml\""
			"WAFFLE_CONNECTED_FONT=\"${WAFFLE_LATO_PATH}\""
			"WAFFLE_OPENING_CONFIG=\"${CMAKE_CURRENT_LIST_DIR}/reference/fixtures/seed-1/state-0.json\"")
		if(MINGW)
			target_link_options(waffle_native_game PRIVATE -static)
		endif()
		add_test(NAME connected_slice_smoke COMMAND waffle_native_game --smoke --seed 42)
		add_test(NAME connected_interaction_smoke COMMAND waffle_native_game --interaction-smoke --seed 42)
		add_test(NAME connected_interaction_compact COMMAND waffle_native_game --interaction-smoke --seed 42 --size 640 360)
		add_test(NAME connected_settlement_desktop COMMAND waffle_native_game --settlement-smoke --seed 42)
		add_test(NAME connected_settlement_compact COMMAND waffle_native_game --settlement-smoke --seed 42 --size 640 360)
		add_test(NAME connected_crests_desktop COMMAND waffle_native_game --crest-smoke --seed 42)
		add_test(NAME connected_crests_compact COMMAND waffle_native_game --crest-smoke --seed 42 --size 640 360)
		set_tests_properties(connected_interaction_smoke connected_interaction_compact
			connected_settlement_desktop connected_settlement_compact connected_crests_desktop connected_crests_compact PROPERTIES TIMEOUT 60
			ENVIRONMENT "SDL_VIDEODRIVER=dummy;SDL_RENDER_DRIVER=software")
		find_program(WAFFLE_LIFE_TEST_NODE NAMES node)
		if(WAFFLE_LIFE_TEST_NODE)
			foreach(width IN ITEMS 1120 640)
				if(width EQUAL 1120)
					set(height 640)
				else()
					set(height 360)
				endif()
				add_test(NAME connected_life_map_${width} COMMAND "${CMAKE_COMMAND}"
					"-Dnode=${WAFFLE_LIFE_TEST_NODE}"
					"-Dgame=$<TARGET_FILE:waffle_native_game>"
					"-Dgenerator=${CMAKE_CURRENT_LIST_DIR}/src/tests/life_ui_fixture.mjs"
					"-Dfixture=${CMAKE_CURRENT_BINARY_DIR}/life-exhibits-${width}"
					"-Dwidth=${width}" "-Dheight=${height}"
					-P "${CMAKE_CURRENT_LIST_DIR}/src/tests/check_life_ui.cmake")
				set_tests_properties(connected_life_map_${width} PROPERTIES TIMEOUT 60
					ENVIRONMENT "SDL_VIDEODRIVER=dummy;SDL_RENDER_DRIVER=software")
			endforeach()
		endif()
		add_test(NAME connected_slice_import COMMAND waffle_native_game --smoke
			--load "${CMAKE_CURRENT_LIST_DIR}/reference/fixtures/seed-1/state-0.json")
		add_test(NAME connected_slice_runner_save COMMAND "${CMAKE_COMMAND}"
			"-Dgame=$<TARGET_FILE:waffle_native_game>"
			"-Dstate=${CMAKE_CURRENT_LIST_DIR}/reference/fixtures/seed-1/state-0.json"
			"-Doutput=${CMAKE_CURRENT_BINARY_DIR}/connected-runner-test.json"
			-P "${CMAKE_CURRENT_LIST_DIR}/src/tests/check_connected_save.cmake")
		add_test(NAME connected_save_slots COMMAND waffle_native_game --save-smoke
			"${CMAKE_CURRENT_BINARY_DIR}/connected-native-test" --seed 42)
		set_tests_properties(connected_slice_smoke connected_slice_import connected_slice_runner_save
			connected_save_slots PROPERTIES TIMEOUT 60)
	endif()
endif()

if(TARGET waffle_native_game)
	target_compile_features(waffle_native_game PRIVATE cxx_std_20)
	target_include_directories(waffle_native_game PRIVATE src)
	target_link_libraries(waffle_native_game PRIVATE waffle_timegraph waffle_demo_probe
		${WAFFLE_SDL_TARGET} waffle_png_headers webp Freetype::Freetype)
endif()
