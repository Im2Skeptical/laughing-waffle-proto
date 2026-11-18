add_library(waffle_core STATIC js_number.cpp json.cpp rng.cpp sha256.cpp)
target_compile_features(waffle_core PUBLIC cxx_std_20)
target_include_directories(waffle_core PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/..")

# Propagate the FP contract to consumers, including future sim/timegraph code.
# MSVC 19.50 defaults to precise with contraction off. /fp:contract- is
# unrecognized (D9002). Before VS 2022 even precise allowed contraction.
if(CMAKE_CXX_COMPILER_ID STREQUAL "MSVC")
	if(MSVC_VERSION LESS 1930)
		target_compile_options(waffle_core PUBLIC /fp:strict)
	else()
		target_compile_options(waffle_core PUBLIC /fp:precise)
	endif()
elseif(CMAKE_CXX_COMPILER_FRONTEND_VARIANT STREQUAL "MSVC")
	target_compile_options(waffle_core PUBLIC /clang:-fno-fast-math /clang:-ffp-contract=off)
else()
	target_compile_options(waffle_core PUBLIC -fno-fast-math -ffp-contract=off)
endif()

if(NOT ANDROID)
	set(vector_dir "${CMAKE_CURRENT_SOURCE_DIR}/../tests/vectors")
	add_executable(waffle_core_tests ../tests/core_test.cpp)
	target_link_libraries(waffle_core_tests PRIVATE waffle_core)
	if(MINGW)
		target_link_options(waffle_core_tests PRIVATE -static)
	endif()
	add_test(NAME core_layering COMMAND "${CMAKE_COMMAND}"
		"-Dsource_dir=${CMAKE_CURRENT_SOURCE_DIR}/.." -P "${CMAKE_CURRENT_SOURCE_DIR}/check_layering.cmake")
	add_test(NAME core_vectors COMMAND waffle_core_tests vectors "${vector_dir}/core-vectors.json")
	add_test(NAME core_state_round_trip COMMAND waffle_core_tests states "${vector_dir}/core-states.json")
	set_tests_properties(core_layering core_vectors core_state_round_trip PROPERTIES TIMEOUT 60)
endif()
