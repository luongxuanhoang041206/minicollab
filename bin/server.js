import { loadConfig } from '../src/core/config.js';
import { createLogger } from '../src/core/logger.js';

const config = loadConfig();
const logger = createLogger({
    level: config.logLevel,
    service: 'minicollab',
});

logger.info(`Server initialized in ${config.env} mode on port ${config.port}`);
