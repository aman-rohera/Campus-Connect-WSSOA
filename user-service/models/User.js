const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    _id: { type: String },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    role: { type: String, default: 'Student' },
    department: { type: String, required: true }
}, {
    timestamps: true,
    _id: false
});

module.exports = mongoose.model('User', userSchema);
