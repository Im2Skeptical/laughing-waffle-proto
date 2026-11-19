file(READ "${state}" base)
file(WRITE "${output}"
    "{\"meta\":{\"schemaVersion\":33},\"state\":${base},\"timeline\":{\"baseStateData\":${base},\"actions\":[{\"tSec\":0,\"kind\":\"settlementSelectVassal\",\"payload\":{\"candidateIndex\":0}}],\"cursorSec\":0,\"historyEndSec\":7}}")
execute_process(COMMAND "${game}" --smoke --load "${output}" RESULT_VARIABLE result OUTPUT_VARIABLE report)
if(NOT result EQUAL 0 OR NOT report MATCHES "opening t=7 with 1 actions")
    message(FATAL_ERROR "Runner import failed (${result}): ${report}")
endif()
message(STATUS "${report}")
