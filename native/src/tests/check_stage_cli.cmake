set(before "${fixture}/before-advance_clock.json")
set(after "${fixture}/after-advance_clock.json")
execute_process(COMMAND "${parity}" stage --stage advance_clock --before "${before}" --after "${after}"
	COMMAND_ERROR_IS_FATAL ANY)

file(READ "${after}" original)
string(REPLACE [=["_seasonChanged":false]=] [=["_seasonChanged":true]=] changed "${original}")
if(original STREQUAL changed)
	message(FATAL_ERROR "the clock fixture must have an unlatched season")
endif()
set(mismatch "${output_dir}/stage-wrong-latch.json")
file(WRITE "${mismatch}" "${changed}")
execute_process(COMMAND "${parity}" stage --stage advance_clock --before "${before}" --after "${mismatch}"
	RESULT_VARIABLE status OUTPUT_VARIABLE difference ERROR_VARIABLE error)
string(FIND "${difference}" [=[First divergent path: $.sidecar._seasonChanged]=] first_path)
if(NOT status EQUAL 1 OR first_path LESS 0)
	message(FATAL_ERROR "expected a sidecar mismatch, got ${status} ${difference} ${error}")
endif()

file(READ "${before}" initial)
string(REPLACE [=["_seasonChanged":false]=] [=["_seasonChanged":true]=] latched "${initial}")
set(latched_before "${output_dir}/stage-latched-before.json")
file(WRITE "${latched_before}" "${latched}")
execute_process(COMMAND "${parity}" stage --stage advance_clock --before "${latched_before}" --after "${mismatch}"
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

execute_process(COMMAND "${parity}" stage --stage seasonal_practices --before "${after}" --after "${after}"
	RESULT_VARIABLE status OUTPUT_VARIABLE difference ERROR_VARIABLE error)
if(NOT status EQUAL 3 OR NOT difference MATCHES "not ported")
	message(FATAL_ERROR "expected an unported stage, got ${status} ${difference} ${error}")
endif()
execute_process(COMMAND "${parity}" stage --stage seasonal_practices --before "${after}" --after "${mismatch}"
	RESULT_VARIABLE status OUTPUT_VARIABLE difference ERROR_VARIABLE error)
if(NOT status EQUAL 1 OR NOT difference MATCHES "not ported")
	message(FATAL_ERROR "expected an unported stage mismatch, got ${status} ${difference} ${error}")
endif()
