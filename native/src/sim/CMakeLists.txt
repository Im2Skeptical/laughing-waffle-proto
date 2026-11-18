add_library(waffle_sim STATIC
	browser/detail/codec.cpp
	browser/generated/game_state.cpp
	state/mirror_mapping.cpp
	state/runtime_state.cpp
)
target_compile_features(waffle_sim PUBLIC cxx_std_20)
target_link_libraries(waffle_sim PUBLIC waffle_core)

if(NOT ANDROID)
	add_executable(waffle_parity ../tools/parity.cpp)
	target_link_libraries(waffle_parity PRIVATE waffle_sim)
	add_executable(waffle_browser_tests ../tests/browser_state_test.cpp)
	target_link_libraries(waffle_browser_tests PRIVATE waffle_sim)
	if(MINGW)
		target_link_options(waffle_parity PRIVATE -static)
		target_link_options(waffle_browser_tests PRIVATE -static)
	endif()

	set(native_dir "${CMAKE_CURRENT_SOURCE_DIR}/../..")
	add_test(NAME browser_state_l0 COMMAND waffle_browser_tests fixtures
		"${native_dir}/src/tests/vectors/seed-1-initial.json"
		"${native_dir}/reference/fixtures/seed-1/state-0.json"
		"${native_dir}/reference/fixtures/seed-1/hashes.tsv")
	add_test(NAME browser_state_controls COMMAND waffle_browser_tests controls
		"${native_dir}/src/tests/vectors/seed-1-initial.json")
	add_test(NAME runtime_state_l0 COMMAND waffle_browser_tests runtime-fixtures
		"${native_dir}/src/tests/vectors/seed-1-initial.json"
		"${native_dir}/reference/fixtures/seed-1/state-0.json"
		"${native_dir}/reference/fixtures/seed-1/hashes.tsv")
	add_test(NAME runtime_state_controls COMMAND waffle_browser_tests runtime-controls
		"${native_dir}/src/tests/vectors/seed-1-initial.json")
	add_test(NAME parity_cli COMMAND "${CMAKE_COMMAND}"
		"-Dparity=$<TARGET_FILE:waffle_parity>"
		"-Dinput=${native_dir}/reference/fixtures/seed-1/state-0.json"
		"-Doutput_dir=${CMAKE_CURRENT_BINARY_DIR}"
		-P "${native_dir}/src/tests/check_parity_cli.cmake")
	set_tests_properties(browser_state_l0 browser_state_controls runtime_state_l0 runtime_state_controls
		parity_cli PROPERTIES TIMEOUT 60)

	find_program(WAFFLE_NODE_EXECUTABLE NAMES node)
	if(WAFFLE_NODE_EXECUTABLE)
		add_test(NAME browser_schema_codegen
			COMMAND "${WAFFLE_NODE_EXECUTABLE}" "${native_dir}/schema/codegen.mjs" --check)
		add_test(NAME runtime_field_coverage
			COMMAND "${WAFFLE_NODE_EXECUTABLE}" "${native_dir}/schema/runtime-codegen.mjs" --check)
		set_tests_properties(browser_schema_codegen runtime_field_coverage PROPERTIES TIMEOUT 60)
	endif()
endif()
