const log = (s) => console.log(s);

const A = async (ctx,next) => {
    log('A start');
    await next();
    log('A end');
};

const B = async (ctx, next) => {
    log('B start');
    next();
    log('B end');
}

const C = async (ctx, next) => {
    log('C start');
    await next();
    log('C end');
}

const handler = async () => log('handler');

await A({}, () => B({}, () => C({}, () => handler())));