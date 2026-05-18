const UnknownCardModel = require('../models/unknownCard.model');

const UnknownCardController = {
    getAll: async (req, res, next) => {
        try {
            const cards = await UnknownCardModel.findAll();
            res.json({ success: true, data: cards, count: cards.length });
        } catch (err) {
            next(err);
        }
    },

    delete: async (req, res, next) => {
        try {
            const card = await UnknownCardModel.delete(req.params.cardUid);
            if (!card) {
                return res.status(404).json({ success: false, message: 'Khong tim thay' });
            }
            res.json({ success: true, message: 'Da xoa' });
        } catch (err) {
            next(err);
        }
    },
};

module.exports = UnknownCardController;
