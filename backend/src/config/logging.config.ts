// config/logging.config.ts
export const loggingConfig = {
  query: {
    maxPageSize: parseInt(process.env.LOG_MAX_PAGE_SIZE || '200')
  },
  export: {
    maxRecords: parseInt(process.env.LOG_EXPORT_MAX_RECORDS || '50000'),
    chunkSize: parseInt(process.env.LOG_EXPORT_CHUNK_SIZE || '1000')
  },
  retention: {
    defaultDays: parseInt(process.env.LOG_RETENTION_DAYS || '90')
  }
};