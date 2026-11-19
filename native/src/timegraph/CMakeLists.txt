find_package(Threads REQUIRED)

add_library(waffle_timegraph STATIC anchor.cpp forecast.cpp summary.cpp)
target_link_libraries(waffle_timegraph PUBLIC waffle_sim PRIVATE Threads::Threads)

target_sources(waffle_parity PRIVATE ../tools/timegraph_tool.cpp)
target_link_libraries(waffle_parity PRIVATE waffle_timegraph)

if(NOT ANDROID)
    add_executable(waffle_timegraph_test ../tests/timegraph_test.cpp)
    target_link_libraries(waffle_timegraph_test PRIVATE waffle_timegraph)
    if(MINGW)
        target_link_options(waffle_timegraph_test PRIVATE -static)
    endif()

    set(fixture "${PROJECT_SOURCE_DIR}/reference/fixtures/seed-1/state-0.json")
    add_test(NAME timegraph_hashes COMMAND "${CMAKE_COMMAND}"
        "-Dparity=$<TARGET_FILE:waffle_parity>"
        "-Dfixture=${fixture}"
        "-Djournal=${PROJECT_SOURCE_DIR}/reference/fixtures/action-boundaries/actions.json"
        "-Doutput_dir=${CMAKE_CURRENT_BINARY_DIR}"
        -P "${PROJECT_SOURCE_DIR}/src/tests/check-timegraph.cmake")
    foreach(test restore pressure terminal)
        add_test(NAME timegraph_${test} COMMAND waffle_timegraph_test ${test} "${fixture}")
    endforeach()
    set_tests_properties(timegraph_hashes timegraph_restore timegraph_pressure timegraph_terminal PROPERTIES TIMEOUT 60)
endif()
