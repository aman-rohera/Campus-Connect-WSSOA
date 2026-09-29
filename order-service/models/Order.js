const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    _id: { type: String },
    userId: { type: String, required: true },
    productId: { type: String, required: true },
    quantity: { type: Number, required: true, default: 1 },
    totalPrice: { type: Number, required: true },
    status: { type: String, default: 'CONFIRMED' },
    userSnapshot: {
        name: String,
        email: String,
        department: String
    },
    productSnapshot: {
        name: String,
        price: Number,
        category: String
    }
}, {
    timestamps: true,
    _id: false
});

module.exports = mongoose.model('Order', orderSchema);
