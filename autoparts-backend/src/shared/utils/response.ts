// ═══════════════════════════════════════════════════════════
//  ApiError
// ═══════════════════════════════════════════════════════════

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg: string, details?: unknown) {
    return new ApiError(400, msg, details, 'BAD_REQUEST');
  }
  static unauthorized(msg = 'Non authentifié') {
    return new ApiError(401, msg, undefined, 'UNAUTHORIZED');
  }
  static forbidden(msg = 'Accès refusé') {
    return new ApiError(403, msg, undefined, 'FORBIDDEN');
  }
  static notFound(resource: string) {
    return new ApiError(404, `${resource} introuvable`, undefined, 'NOT_FOUND');
  }
  static conflict(msg: string) {
    return new ApiError(409, msg, undefined, 'CONFLICT');
  }
  static unprocessable(msg: string, details?: unknown) {
    return new ApiError(422, msg, details, 'UNPROCESSABLE');
  }
  static tooManyRequests() {
    return new ApiError(429, 'Trop de requêtes, veuillez réessayer plus tard', undefined, 'RATE_LIMITED');
  }
  static internal(msg = 'Erreur interne du serveur') {
    return new ApiError(500, msg, undefined, 'INTERNAL');
  }
}

// ═══════════════════════════════════════════════════════════
//  ApiResponse
// ═══════════════════════════════════════════════════════════

export const ApiResponse = {
  success<T>(data: T, message = 'Succès', meta?: Record<string, unknown>) {
    return { success: true as const, message, data, ...(meta ? { meta } : {}) };
  },

  created<T>(data: T, message = 'Créé avec succès') {
    return { success: true as const, message, data };
  },

  paginated<T>(result: {
    data: T[];
    total: number;
    page: number;
    limit: number;
  }) {
    const totalPages = Math.ceil(result.total / result.limit);
    return {
      success:    true as const,
      data:       result.data,
      pagination: {
        page:       result.page,
        limit:      result.limit,
        total:      result.total,
        totalPages,
        hasNext:    result.page < totalPages,
        hasPrev:    result.page > 1,
      },
    };
  },

  noContent(message = 'Opération réussie') {
    return { success: true as const, message };
  },
};
