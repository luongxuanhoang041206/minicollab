const LEVELs = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
}

export function createLogger({
    level = 'info',
    service,
    write = (line) => process.stdout.write(line + '\n'),
    now = () => new Date(),
    fields = {},
}) {
    const logger = {};

    function log(logLevel, msg, extraFields = {}) {
        const levelVal = LEVELs[logLevel] ?? LEVELs.info;
        const minLevel = LEVELs[level] ?? LEVELs.info;

        if (levelVal < minLevel) return;

        const line = JSON.stringify({
            ts: now().toISOString(),
            level: logLevel,
            service,
            msg,
            ...fields,
            ...extraFields
        })

        write(line);
    }

    function debug(msg, fields) {
        log('debug', msg, fields)
    }

    function info(msg, fields) {
        log('info', msg, fields)
    }

    function warn(msg, fields) {
        log('warn', msg, fields)
    }

    function error(msg, fields) {
        log('error', msg, fields)
    }

    function child(childFields = {}) {
        return createLogger({
            level,
            service,
            write,
            now,
            fields: { ...fields, ...childFields }
        });
    }

    return {
        debug,
        info,
        warn,
        error,
        child,
    };
}