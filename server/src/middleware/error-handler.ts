import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../lib/errors.js';

export function errorHandler(
  error: FastifyError | AppError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  request.log.error(error);

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
  }

  // Fastify validation errors
  if (error.validation) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: error.message,
    });
  }

  // FastifyError with its own 4xx statusCode (e.g. 413 body-too-large,
  // 415 unsupported media type, 429 rate-limit). Preserve the status so
  // clients get the right signal instead of a misleading 500.
  const fastifyStatus = (error as FastifyError).statusCode;
  if (typeof fastifyStatus === 'number' && fastifyStatus >= 400 && fastifyStatus < 500) {
    return reply.status(fastifyStatus).send({
      error: (error as FastifyError).code ?? 'CLIENT_ERROR',
      message: error.message,
    });
  }

  // Default 500
  return reply.status(500).send({
    error: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : error.message,
  });
}
