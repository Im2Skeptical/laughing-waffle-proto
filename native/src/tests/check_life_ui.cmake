execute_process(COMMAND "${node}" "${generator}" "${fixture}" COMMAND_ERROR_IS_FATAL ANY)
execute_process(
  COMMAND "${game}" --life-smoke "${fixture}" --seed 42 --size "${width}" "${height}"
  COMMAND_ERROR_IS_FATAL ANY)
