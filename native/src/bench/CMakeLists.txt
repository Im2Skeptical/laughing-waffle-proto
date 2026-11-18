if(NOT ANDROID)
	add_executable(waffle_bench main.cpp workload.cpp)
	target_link_libraries(waffle_bench PRIVATE waffle_core)
	target_compile_definitions(waffle_bench PRIVATE
		"WAFFLE_BENCH_COMPILER=\"${CMAKE_CXX_COMPILER_ID} ${CMAKE_CXX_COMPILER_VERSION}\""
		"WAFFLE_BENCH_BUILD=\"$<CONFIG>\"")
	if(MINGW)
		target_link_options(waffle_bench PRIVATE -static)
	endif()
	add_test(NAME bench_smoke COMMAND waffle_bench --smoke
		"${CMAKE_CURRENT_SOURCE_DIR}/../tests/vectors/seed-1-initial.json")
	set_tests_properties(bench_smoke PROPERTIES TIMEOUT 60)
endif()
