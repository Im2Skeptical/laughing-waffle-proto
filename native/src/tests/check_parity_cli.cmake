set(exported "${output_dir}/parity-roundtrip.json")
execute_process(COMMAND "${parity}" roundtrip "${input}" --out "${exported}"
	COMMAND_ERROR_IS_FATAL ANY)
execute_process(COMMAND "${parity}" hash "${exported}"
	OUTPUT_VARIABLE hash OUTPUT_STRIP_TRAILING_WHITESPACE COMMAND_ERROR_IS_FATAL ANY)
execute_process(COMMAND "${parity}" hash "${input}"
	OUTPUT_VARIABLE expected OUTPUT_STRIP_TRAILING_WHITESPACE COMMAND_ERROR_IS_FATAL ANY)
if(NOT hash STREQUAL expected)
	message(FATAL_ERROR "round-trip hash: expected ${expected}, got ${hash}")
endif()
execute_process(COMMAND "${parity}" diff "${input}" "${exported}" COMMAND_ERROR_IS_FATAL ANY)
execute_process(COMMAND "${parity}" runtime-roundtrip "${input}" --out "${exported}"
	COMMAND_ERROR_IS_FATAL ANY)
execute_process(COMMAND "${parity}" hash "${exported}"
	OUTPUT_VARIABLE hash OUTPUT_STRIP_TRAILING_WHITESPACE COMMAND_ERROR_IS_FATAL ANY)
if(NOT hash STREQUAL expected)
	message(FATAL_ERROR "runtime round-trip hash: expected ${expected}, got ${hash}")
endif()
execute_process(COMMAND "${parity}" runtime-stats "${input}"
	OUTPUT_VARIABLE stats COMMAND_ERROR_IS_FATAL ANY)
string(JSON sites GET "${stats}" sites)
string(JSON hot_bytes GET "${stats}" hotBytes)
string(JSON copies GET "${stats}" copySamples)
string(JSON trace_cursors GET "${stats}" coldSubtrees PracticeEventJournal.trace cursors)
string(JSON trace_bytes GET "${stats}" coldSubtrees PracticeEventJournal.trace liveBytes)
if(NOT sites EQUAL 20 OR hot_bytes LESS 1 OR NOT copies EQUAL 101 OR
		NOT trace_cursors EQUAL 1 OR trace_bytes LESS 1)
	message(FATAL_ERROR "unexpected runtime statistics: ${stats}")
endif()

set(left "${output_dir}/parity-left.json")
set(right "${output_dir}/parity-right.json")
# UTF-16 sorts the astral key (D800 DC00) before the BMP key (E000).
file(WRITE "${left}" [=[{"\ue000":[1,2],"\ud800\udc00":{"a":[],"b":null},"x":-0}]=])
file(WRITE "${right}" [=[{"\ue000":{},"\ud800\udc00":{},"x":0}]=])
execute_process(COMMAND "${parity}" diff "${left}" "${right}"
	RESULT_VARIABLE status OUTPUT_VARIABLE difference ERROR_VARIABLE error ENCODING UTF-8)
if(NOT status EQUAL 1 OR NOT difference MATCHES "^4 differing leaves[.]")
	message(FATAL_ERROR "expected four differing leaves; got ${status} ${difference} ${error}")
endif()
string(FIND "${difference}" [=[First divergent path: $["𐀀"].a]=] first_path)
if(first_path LESS 0)
	message(FATAL_ERROR "expected the UTF-16 ordered first path; got ${difference}")
endif()
execute_process(COMMAND "${parity}" roundtrip "${left}"
	RESULT_VARIABLE status ERROR_VARIABLE error OUTPUT_QUIET)
if(NOT status EQUAL 2 OR NOT error MATCHES "unknown field")
	message(FATAL_ERROR "expected a strict import failure; got ${status} ${error}")
endif()
