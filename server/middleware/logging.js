const { v4: uuidv4 } = require('uuid')

function createLogger() {
  const log = (level, message, meta = {}) => {
    try {
      const entry = {
        level,
        message,
        time: new Date().toISOString(),
        ...meta,
      }
      console.log(JSON.stringify(entry))
    } catch (e) {
      console.log(level.toUpperCase(), message)
    }
  }
  return {
    info: (message, meta) => log('info', message, meta),
    warn: (message, meta) => log('warn', message, meta),
    error: (message, meta) => log('error', message, meta),
  }
}

const logger = createLogger()

function requestLogger(req, res, next) {
  req.id = req.id || uuidv4()
  const start = Date.now()
  logger.info('request:start', { requestId: req.id, method: req.method, url: req.originalUrl, ip: req.ip })
  res.on('finish', () => {
    const durationMs = Date.now() - start
    logger.info('request:finish', { requestId: req.id, status: res.statusCode, durationMs })
  })
  next()
}

module.exports = {
  logger,
  requestLogger,
}


