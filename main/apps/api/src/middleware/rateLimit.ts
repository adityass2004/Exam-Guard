import rateLimit from 'express-rate-limit';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test', // Skip in test unless explicitly testing rate limits
  handler: (_req, res) => {
    const requestId = (_req as unknown as { id?: string }).id;
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests on authentication endpoints, please try again later.',
        requestId,
      },
    });
  },
});

