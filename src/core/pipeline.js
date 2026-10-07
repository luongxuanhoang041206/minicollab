export function compose(middleware) {
    if (!Array.isArray(middleware)) {
        throw new TypeError(
            'Middleware stack must be an array!'
        );
    }

    for (const fn of middleware) {
        if (typeof fn !== 'function') {
            throw new TypeError(
                'Middleware must be composed of functions!'
            );
        }
    }

    const middlewareCopy = middleware.slice();

    return function run(ctx) {
        let index = -1;

        function dispatch(i) {
            if (i <= index) {
                return Promise.reject(
                    new Error('next() called multiple times')
                );
            }

            index = i;

            const fn = middlewareCopy[i];

            if (!fn) {
                return Promise.resolve();
            }

            return Promise.resolve().then(() => {
                return fn(ctx, () => dispatch(i + 1));
            });
        }

        return dispatch(0);
    };
}