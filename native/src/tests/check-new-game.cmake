execute_process(COMMAND "${parity}" new-game --seed 1 --out "${output}"
    COMMAND_ERROR_IS_FATAL ANY)
execute_process(COMMAND "${parity}" diff "${expected}" "${output}"
    COMMAND_ERROR_IS_FATAL ANY)
