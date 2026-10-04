import { NextResponse } from 'next/server';

/**
 * Safely serialize objects that may contain BigInt values (e.g. phone, aadhar, emergencyNo)
 * BigInt cannot be natively serialized by JSON.stringify, so we convert them to strings.
 */
export function bigintSafeSerialize(value) {
  return JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
  );
}

/**
 * Standardized successful JSON response
 * Compatible with Web Admin, iOS, Android, Flutter, and React Native
 */
export function successResponse(data = null, message = 'Success', statusCode = 200, meta = null) {
  const body = {
    success: true,
    message,
    data: bigintSafeSerialize(data),
    timestamp: new Date().toISOString(),
  };

  if (meta && typeof meta === 'object') {
    body.pagination = meta.pagination || meta;
  }

  return NextResponse.json(body, {
    status: statusCode,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

/**
 * Standardized error JSON response
 * Compatible with Web Admin, iOS, Android, Flutter, and React Native
 * Strictly scrubs internal stack traces and server secrets.
 */
export function errorResponse(message = 'An error occurred', statusCode = 400, errors = null) {
  // Security guard: Ensure no stack traces or raw error objects leak in 500 errors
  let sanitizedErrors = errors;
  if (statusCode >= 500) {
    sanitizedErrors = undefined;
  } else if (errors instanceof Error) {
    sanitizedErrors = errors.message;
  }

  return NextResponse.json(
    {
      success: false,
      message,
      errors: sanitizedErrors || undefined,
      timestamp: new Date().toISOString(),
    },
    {
      status: statusCode,
      headers: { 'Cache-Control': 'private, no-store' },
    }
  );
}

/**
 * 400 Bad Request
 */
export function badRequest(message = 'Bad request. Invalid input data.', errors = null) {
  return errorResponse(message, 400, errors);
}

/**
 * 401 Unauthorized
 */
export function unauthorized(message = 'Authentication required. Please log in.') {
  return errorResponse(message, 401);
}

/**
 * 403 Forbidden
 */
export function forbidden(message = 'Access denied. You do not have permission to perform this action.') {
  return errorResponse(message, 403);
}

/**
 * 404 Not Found
 */
export function notFound(message = 'The requested resource was not found.') {
  return errorResponse(message, 404);
}

/**
 * 409 Conflict
 */
export function conflict(message = 'Conflict. A resource with this identifier already exists.', errors = null) {
  return errorResponse(message, 409, errors);
}

/**
 * 500 Internal Server Error
 * Logs the internal error to console while keeping the client response clean and secure.
 */
export function serverError(message = 'An unexpected server error occurred.', internalError = null) {
  if (internalError) {
    console.error('[SERVER ERROR 500]:', internalError);
  }
  return errorResponse(message, 500);
}

/**
 * Centralized API Error Interceptor
 * Maps known Prisma errors and generic exceptions to clean, secure HTTP status responses.
 */
export function handleApiError(error, defaultMessage = 'An unexpected server error occurred.') {
  // Always log internal details to server logs for debugging
  console.error('[API Handler Exception]:', error);

  if (!error) {
    return serverError(defaultMessage);
  }

  // Handle known Prisma Client error codes
  if (error.code) {
    switch (error.code) {
      case 'P2002': {
        // Unique constraint violation
        const target = Array.isArray(error.meta?.target)
          ? error.meta.target.join(', ')
          : error.meta?.target || 'field';
        return conflict(
          `A record with this ${target} already exists. Please use a unique value.`,
          { field: target, code: 'UNIQUE_CONSTRAINT_VIOLATION' }
        );
      }
      case 'P2025': {
        // Record to update/delete not found
        return notFound(
          error.meta?.cause || 'The requested record does not exist or has already been removed.'
        );
      }
      case 'P2003': {
        // Foreign key constraint failed
        const fieldName = error.meta?.field_name || 'relation';
        return conflict(
          `Cannot complete operation: This record is referenced by or depends on another resource (${fieldName}).`,
          { field: fieldName, code: 'FOREIGN_KEY_VIOLATION' }
        );
      }
      case 'P2014': {
        // Required relation violation
        return badRequest(
          'Operation violates a required database relation.',
          { code: 'RELATION_VIOLATION' }
        );
      }
      default:
        break;
    }
  }

  // If error has a custom status or statusCode
  const status = error.statusCode || error.status;
  if (status && typeof status === 'number' && status >= 400 && status < 600) {
    return errorResponse(error.message || defaultMessage, status, error.errors);
  }

  // Fallback to generic 500 - Never expose raw exception message or stack trace
  return serverError(defaultMessage, error);
}
