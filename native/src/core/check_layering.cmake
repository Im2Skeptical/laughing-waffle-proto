cmake_minimum_required(VERSION 3.28)

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
	endforeach()
endforeach()
