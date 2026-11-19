set(before "${fixture}/before-advance_clock.json")
set(after "${fixture}/after-advance_clock.json")
execute_process(COMMAND "${parity}" stage --stage advance_clock --before "${before}" --after "${after}"
	COMMAND_ERROR_IS_FATAL ANY)

file(READ "${after}" original)
string(REPLACE [=["seasonChanged":false]=] [=["seasonChanged":true]=] changed "${original}")
if(original STREQUAL changed)
	message(FATAL_ERROR "the clock fixture must have a non-seasonal second")
endif()
set(mismatch "${output_dir}/stage-wrong-latch.json")
file(WRITE "${mismatch}" "${changed}")
execute_process(COMMAND "${parity}" stage --stage advance_clock --before "${before}" --after "${mismatch}"
	RESULT_VARIABLE status OUTPUT_VARIABLE difference ERROR_VARIABLE error)
string(FIND "${difference}" [=[First divergent path: $.sidecar.seasonChanged]=] first_path)
if(NOT status EQUAL 1 OR first_path LESS 0)
	message(FATAL_ERROR "expected a sidecar mismatch, got ${status} ${difference} ${error}")
endif()

file(READ "${before}" initial)
string(REPLACE [=["seasonChanged":false]=] [=["seasonChanged":true]=] latched "${initial}")
set(latched_before "${output_dir}/stage-stale-season-before.json")
file(WRITE "${latched_before}" "${latched}")
execute_process(COMMAND "${parity}" stage --stage advance_clock --before "${latched_before}" --after "${after}"
	COMMAND_ERROR_IS_FATAL ANY)

# The opening prelude is idempotent. Perturb its Green tier so this control
# also requires the registry to call the production writer.
string(REPLACE [=["green":{"tier":0}]=] [=["green":{"tier":1}]=] stale_green "${original}")
if(original STREQUAL stale_green)
	message(FATAL_ERROR "the prelude fixture must start with Green tier 0")
endif()
set(stale_green_before "${output_dir}/stage-stale-green.json")
file(WRITE "${stale_green_before}" "${stale_green}")
execute_process(COMMAND "${parity}" stage --stage prelude --before "${stale_green_before}" --after "${after}"
	COMMAND_ERROR_IS_FATAL ANY)

execute_process(COMMAND "${parity}" stage --stage vassal_check --before "${after}" --after "${after}"
	COMMAND_ERROR_IS_FATAL ANY)
execute_process(COMMAND "${parity}" stage --stage vassal_check --before "${after}" --after "${mismatch}"
	RESULT_VARIABLE status OUTPUT_VARIABLE difference ERROR_VARIABLE error)
string(FIND "${difference}" [=[First divergent path: $.sidecar.seasonChanged]=] first_path)
if(NOT status EQUAL 1 OR first_path LESS 0)
	message(FATAL_ERROR "expected a Vassal stage sidecar mismatch, got ${status} ${difference} ${error}")
endif()
