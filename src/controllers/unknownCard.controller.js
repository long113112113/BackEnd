const UnknownCardModel = require('../models/unknownCard.model');

const UnknownCardController = {
    autocomplete: async (req, res, next) => {
        try {
            const q = req.query.q;
            if (!q || typeof q !== 'string') {
                return res.status(400).json({ success: false, message: 'Query parameter q is required' });
            }
            const cards = await UnknownCardModel.search(q.trim());
            res.json({ success: true, data: cards, count: cards.length });
        } catch (err) {
            next(err);
        }
    },

    getAll: async (req, res, next) => {
        try {
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
            const { rows: cards, total } = await UnknownCardModel.findAll(page, limit);
            const totalPages = Math.ceil(total / limit);
            res.json({
                success: true,
                data: cards,
                count: cards.length,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                },
            });
        } catch (err) {
            next(err);
        }
    },

    delete: async (req, res, next) => {
        try {
            const card = await UnknownCardModel.delete(req.params.cardUid);
            if (!card) {
                return res.status(404).json({ success: false, message: 'Card not found' });
            }
            res.json({ success: true, message: 'Card deleted successfully' });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = UnknownCardController;
