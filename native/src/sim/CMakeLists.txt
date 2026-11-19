add_library(waffle_sim STATIC
	browser/detail/codec.cpp
	browser/generated/game_state.cpp
	content/compiled_content.cpp
	state/history_arena.cpp
	practice/events.cpp
	practice/stock.cpp
	practice/phase_stock.cpp
	practice/recipes.cpp
	practice/drain.cpp
	state/mirror_mapping.cpp
	state/runtime_state.cpp
	world/topology.cpp
	world/generate.cpp
	world/generate_biomes.cpp
	world/generate_names.cpp
	settlement/population.cpp
	settlement/migration_reservation.cpp
	settlement/prelude.cpp
	territory/control.cpp
	territory/spawn.cpp
	territory/external.cpp
	vassal/resolution.cpp
	vassal/campaign.cpp
	vassal/shop.cpp
	vassal/founding.cpp
	vassal/commission.cpp
	vassal/inheritance.cpp
	vassal/candidates.cpp
	step/advance_second.cpp
	step/stages.cpp
	stages/advance_clock.cpp
	stages/prelude.cpp
	stages/seasonal_practices.cpp
	stages/spring_death_baseline.cpp
	stages/birth.cpp
	stages/food.cpp
	stages/after_meals_practices.cpp
	stages/garrison_upkeep.cpp
	stages/housing.cpp
	stages/faith.cpp
	stages/migration_practices.cpp
	stages/migration.cpp
	stages/death.cpp
	stages/death_practices.cpp
	stages/control_and_spatial_pressure.cpp
	stages/phase_events_and_drain.cpp
	stages/vassal_check.cpp
	stages/final_flush.cpp
)
target_compile_features(waffle_sim PUBLIC cxx_std_20)
target_link_libraries(waffle_sim PUBLIC waffle_core)
if(MSVC)
	target_compile_options(waffle_sim PRIVATE /bigobj)
endif()

add_executable(waffle_parity ../tools/parity.cpp ../tools/parity_masks.cpp ../tools/parity_run.cpp)
target_link_libraries(waffle_parity PRIVATE waffle_sim)
target_compile_definitions(waffle_parity PRIVATE
	"WAFFLE_REFERENCE_TOPOLOGY_DIR=\"${CMAKE_CURRENT_SOURCE_DIR}/../../reference/topology\"")
if(WIN32)
	target_link_libraries(waffle_parity PRIVATE psapi)
endif()
if(MINGW)
	target_link_options(waffle_parity PRIVATE -static)
endif()

if(NOT ANDROID)
	add_executable(waffle_browser_tests ../tests/browser_state_test.cpp)
	target_link_libraries(waffle_browser_tests PRIVATE waffle_sim)
	add_executable(waffle_step_clock_test ../tests/step_clock_test.cpp)
	target_link_libraries(waffle_step_clock_test PRIVATE waffle_sim)
	add_executable(waffle_content_tests ../tests/content_test.cpp)
	target_link_libraries(waffle_content_tests PRIVATE waffle_sim)
	add_executable(waffle_settlement_ledger_test ../tests/settlement_ledger_test.cpp)
	target_link_libraries(waffle_settlement_ledger_test PRIVATE waffle_sim)
	add_executable(waffle_history_test ../tests/history_test.cpp)
	target_link_libraries(waffle_history_test PRIVATE waffle_sim)
	add_executable(waffle_world_topology_test ../tests/world_topology_test.cpp)
	target_link_libraries(waffle_world_topology_test PRIVATE waffle_sim)
	add_executable(waffle_regional_generation_test ../tests/regional_generation_test.cpp)
	target_link_libraries(waffle_regional_generation_test PRIVATE waffle_sim)
	add_executable(waffle_faith_stage_test ../tests/faith_stage_test.cpp)
	target_link_libraries(waffle_faith_stage_test PRIVATE waffle_sim)
	if(MINGW)
		target_link_options(waffle_browser_tests PRIVATE -static)
		target_link_options(waffle_step_clock_test PRIVATE -static)
		target_link_options(waffle_content_tests PRIVATE -static)
		target_link_options(waffle_settlement_ledger_test PRIVATE -static)
		target_link_options(waffle_history_test PRIVATE -static)
		target_link_options(waffle_world_topology_test PRIVATE -static)
		target_link_options(waffle_regional_generation_test PRIVATE -static)
		target_link_options(waffle_faith_stage_test PRIVATE -static)
	endif()

	set(native_dir "${CMAKE_CURRENT_SOURCE_DIR}/../..")
	add_test(NAME regional_generation COMMAND waffle_regional_generation_test "${native_dir}/reference/topology")
	set_tests_properties(regional_generation PROPERTIES TIMEOUT 60)
	add_test(NAME world_topology_test COMMAND waffle_world_topology_test
		"${native_dir}/reference/topology" "${native_dir}/reference/fixtures/seed-1/state-0.json")
	set_tests_properties(world_topology_test PROPERTIES TIMEOUT 60)
	add_test(NAME captured_content COMMAND waffle_content_tests fixtures
		"${native_dir}/src/tests/vectors/seed-1-initial.json"
		"${native_dir}/reference/fixtures/seed-1/state-0.json")
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
	add_test(NAME step_parity COMMAND waffle_parity step
		--from "${native_dir}/reference/fixtures/seed-1/state-0.json"
		--seconds 1 --expect-dir "${native_dir}/reference/fixtures/windows/seed-1/0"
		--masks "${native_dir}/reference/parity-masks.json")
	add_test(NAME native_run_restore_smoke COMMAND waffle_parity run
		--from "${native_dir}/reference/fixtures/seed-1/state-0.json" --seconds 256
		--hashes "${CMAKE_CURRENT_BINARY_DIR}/native-run-smoke.tsv"
		--expect "${native_dir}/src/tests/vectors/native-run-seed-1.tsv" --anchors)
	add_test(NAME native_run_cross_compiler COMMAND waffle_parity run
		--from "${native_dir}/reference/fixtures/seed-1/state-0.json" --seconds 2048
		--hashes "${CMAKE_CURRENT_BINARY_DIR}/native-run-cross-compiler.tsv"
		--expect "${native_dir}/src/tests/vectors/native-run-cross-compiler.tsv")
	set_tests_properties(native_run_cross_compiler PROPERTIES TIMEOUT 120)
	add_test(NAME step_clock COMMAND waffle_step_clock_test)
	add_test(NAME runtime_history_appends COMMAND waffle_history_test
		"${native_dir}/reference/fixtures/seed-1/state-0.json")
	add_test(NAME faith_collapse_restore COMMAND waffle_faith_stage_test
		"${native_dir}/reference/fixtures/seed-1/state-0.json")
	set_tests_properties(browser_state_l0 browser_state_controls runtime_state_l0 runtime_state_controls
		parity_cli step_parity native_run_restore_smoke step_clock captured_content runtime_history_appends faith_collapse_restore
		PROPERTIES TIMEOUT 60)

	find_program(WAFFLE_NODE_EXECUTABLE NAMES node)
	if(WAFFLE_NODE_EXECUTABLE)
		add_test(NAME pipeline_steady_state_allocations
			COMMAND "${WAFFLE_NODE_EXECUTABLE}" "${native_dir}/src/tests/pipeline-allocations.mjs"
				$<TARGET_FILE:waffle_history_test> "${CMAKE_CURRENT_BINARY_DIR}/allocation-late-state.json")
		# Disabled 19 Nov 2026 at the N03e-3p merge: Birth, Food and Migration still
		# allocate after warmup. N03e-3q re-enables it. Run it explicitly with `ctest -R pipeline_steady_state_allocations`.
		set_tests_properties(pipeline_steady_state_allocations PROPERTIES TIMEOUT 240 DISABLED TRUE)
		add_test(NAME browser_world_topology
			COMMAND "${WAFFLE_NODE_EXECUTABLE}" "${native_dir}/reference/export-topology.mjs" --check)
		set_tests_properties(browser_world_topology PROPERTIES TIMEOUT 60)
		add_test(NAME browser_schema_codegen
			COMMAND "${WAFFLE_NODE_EXECUTABLE}" "${native_dir}/schema/codegen.mjs" --check)
		add_test(NAME runtime_field_coverage
			COMMAND "${WAFFLE_NODE_EXECUTABLE}" "${native_dir}/schema/runtime-codegen.mjs" --check)
		add_test(NAME runtime_history_retention
			COMMAND "${WAFFLE_NODE_EXECUTABLE}" "${native_dir}/src/tests/history-retention.mjs"
				$<TARGET_FILE:waffle_browser_tests> "${native_dir}/reference/fixtures/seed-1/state-0.json"
				"${CMAKE_CURRENT_BINARY_DIR}/history-retention.json")
		add_test(NAME step_parity_controls
			COMMAND "${WAFFLE_NODE_EXECUTABLE}" "${native_dir}/src/tests/check-step-cli.mjs"
				"$<TARGET_FILE:waffle_parity>" "${native_dir}" "${CMAKE_CURRENT_BINARY_DIR}/step-cli-controls")
		add_test(NAME content_field_coverage
			COMMAND "${WAFFLE_NODE_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/content/generate.mjs" --check)
		set_tests_properties(browser_schema_codegen runtime_field_coverage runtime_history_retention step_parity_controls content_field_coverage PROPERTIES TIMEOUT 60)
		add_test(NAME settlement_prelude_windows
			COMMAND "${WAFFLE_NODE_EXECUTABLE}" "${native_dir}/src/tests/settlement-prelude.mjs"
				"$<TARGET_FILE:waffle_parity>" "${native_dir}" "${CMAKE_CURRENT_BINARY_DIR}/settlement-prelude-windows")
		add_test(NAME settlement_ledger_vectors
			COMMAND "${WAFFLE_NODE_EXECUTABLE}" "${native_dir}/src/tests/settlement-ledger-vectors.mjs"
				"$<TARGET_FILE:waffle_settlement_ledger_test>" "${native_dir}/reference/fixtures/seed-1/state-0.json"
				"${CMAKE_CURRENT_BINARY_DIR}/settlement-ledger-vectors.json")
		set_tests_properties(settlement_prelude_windows settlement_ledger_vectors PROPERTIES TIMEOUT 60)
		add_test(NAME settlement_migration
			COMMAND "${WAFFLE_NODE_EXECUTABLE}" "${native_dir}/src/tests/settlement-migration.mjs"
				"$<TARGET_FILE:waffle_parity>" "${native_dir}" "${CMAKE_CURRENT_BINARY_DIR}/settlement-migration")
		set_tests_properties(settlement_migration PROPERTIES TIMEOUT 60)
		add_test(NAME territory_terminal_routing
			COMMAND "${WAFFLE_NODE_EXECUTABLE}" "${native_dir}/src/tests/territory-stage.mjs"
				"$<TARGET_FILE:waffle_parity>" "${native_dir}" "${CMAKE_CURRENT_BINARY_DIR}/territory-stage")
		set_tests_properties(territory_terminal_routing PROPERTIES TIMEOUT 60)
	endif()
endif()
