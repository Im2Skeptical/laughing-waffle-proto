execute_process(COMMAND "${parity}" run --from "${fixture}" --actions "${journal}" --seconds 135
    --hashes "${output_dir}/timegraph-oracle-states.tsv" --timegraph-hashes "${output_dir}/timegraph-oracle.tsv"
    RESULT_VARIABLE result)
if(NOT result EQUAL 0)
    message(FATAL_ERROR "Single-threaded oracle failed (${result})")
endif()

execute_process(COMMAND "${parity}" timegraph --from "${fixture}" --actions "${journal}" --seconds 135
    --samples 0 --repeats 1 --expect "${output_dir}/timegraph-oracle.tsv"
    RESULT_VARIABLE result)
if(NOT result EQUAL 0)
    message(FATAL_ERROR "Forecast hash verification failed (${result})")
endif()
