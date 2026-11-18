cmake_minimum_required(VERSION 3.28)

set(transcendentals "pow|exp|log|log2|log10|sin|cos|tan|atan|atan2|hypot|cbrt|expm1|log1p")
set(std_math "(^|[^A-Za-z0-9_])std[ \t\n]*::(${transcendentals})[fl]?([^A-Za-z0-9_]|$)")
set(unqualified_call "(^|[^A-Za-z0-9_:.>]|[^:]:|[^-]>)(::)?(${transcendentals})[fl]?[ \t\n]*(\\(|\\)[ \t\n]*\\()")

foreach(layer IN ITEMS core sim timegraph)
	file(GLOB_RECURSE sources LIST_DIRECTORIES FALSE "${source_dir}/${layer}/*")
	foreach(source IN LISTS sources)
		# Include extensionless headers and inline/template files as well as .cpp.
		file(READ "${source}" contents)
		string(REPLACE "\r\n" "\n" contents "${contents}")
		string(REPLACE "\\\n" "" contents "${contents}")
		string(REGEX REPLACE "/\\*([^*]|\\*+[^*/])*\\*+/" " " contents "${contents}")
		string(REGEX MATCHALL "(^|\n)[ \t]*#[ \t]*(include(_next)?|import)[ \t]*[<\"][^>\"\n]+[>\"]"
			includes "${contents}")
		foreach(directive IN LISTS includes)
			string(REGEX REPLACE "^[^<\"]*[<\"]([^>\"]*)[>\"]$" "\\1" header "${directive}")
			string(TOLOWER "${header}" header)
			string(REPLACE "\\" "/" header "${header}")
			if(header MATCHES "(^|/)(sdl[0-9]*([/_]|[.]h$)|rmlui([/_]|[.]h(pp)?$))"
				OR header MATCHES "^(chrono|filesystem|fstream|random)$")
				string(STRIP "${directive}" directive)
				message(SEND_ERROR "${source}: forbidden include in ${layer}: ${directive}")
			endif()
		endforeach()

		if(source MATCHES "\\.(md|cmake|txt)$")
			continue()
		endif()
		# Remove line comments and ordinary string literals. Keep whitespace between
		# tokens, and normalize the space following member and scope operators.
		string(REGEX REPLACE "//[^\n]*|\"([^\"\\\\\n]|\\\\.)*\"" " " code "${contents}")
		string(REGEX REPLACE "(::|\\.|->)[ \t\n]*" "\\1" code "${code}")
		if(source STREQUAL "${source_dir}/core/js_math.hpp")
			# The approved API declares these names inside its own namespace.
			string(REGEX REPLACE "\ndouble (${transcendentals})\\(double [a-z]+(, double [a-z]+)?\\) noexcept;"
				"\n" code "${code}")
		endif()
		if(code MATCHES "${std_math}|${unqualified_call}")
			string(STRIP "${CMAKE_MATCH_0}" symbol)
			message(SEND_ERROR "${source}: forbidden platform math in ${layer}: ${symbol}. Use waffle::core::js.")
		endif()
	endforeach()
endforeach()
