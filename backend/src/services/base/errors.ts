export class DataSourceError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'DataSourceError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ConnectionError extends DataSourceError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONNECTION_ERROR', cause);
    this.name = 'ConnectionError';
  }
}

export class AuthenticationError extends DataSourceError {
  constructor(message: string, cause?: Error) {
    super(message, 'AUTH_ERROR', cause);
    this.name = 'AuthenticationError';
  }
}

export class QueryError extends DataSourceError {
  constructor(message: string, cause?: Error) {
    super(message, 'QUERY_ERROR', cause);
    this.name = 'QueryError';
  }
}

export class ValidationError extends DataSourceError {
  constructor(message: string, public field?: string, cause?: Error) {
    super(message, 'VALIDATION_ERROR', cause);
    this.name = 'ValidationError';
  }
}

export class TimeoutError extends DataSourceError {
  constructor(message: string, cause?: Error) {
    super(message, 'TIMEOUT_ERROR', cause);
    this.name = 'TimeoutError';
  }
}

export class CredentialError extends DataSourceError {
  constructor(message: string, cause?: Error) {
    super(message, 'CREDENTIAL_ERROR', cause);
    this.name = 'CredentialError';
  }
}