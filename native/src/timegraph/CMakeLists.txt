find_package(Threads REQUIRED)

add_library(waffle_timegraph STATIC anchor.cpp forecast.cpp summary.cpp)
target_link_libraries(waffle_timegraph PUBLIC waffle_sim PRIVATE Threads::Threads)
