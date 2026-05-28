const { authMiddleware } = require('../../src/middlewares/auth.middleware');

describe('authMiddleware Unit Tests', () => {
    test('returns 401 when no token is provided in cookies or headers', async () => {
        const req = {
            cookies: {},
            headers: {}
        };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn(),
        };
        const next = vi.fn();

        await authMiddleware(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
            success: false,
            message: 'No authorization token provided. Please log in.',
        });
        expect(next).not.toHaveBeenCalled();
    });
});
