const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    _id: { type: String },
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    stock: { type: Number, default: 10 },
    category: { type: String, default: 'General' }
}, {
    timestamps: true,
    _id: false
});

module.exports = mongoose.model('Product', productSchema);
