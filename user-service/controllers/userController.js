const User = require('../models/User');

// GET /users - Retrieve all users
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find();
        res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// GET /users/:id - Retrieve user by ID
exports.getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                status: 404,
                error: "Not Found",
                message: `User with ID '${req.params.id}' was not found.`
            });
        }
        res.status(200).json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// POST /users - Create new user
exports.createUser = async (req, res) => {
    try {
        const { id, _id, name, email, role, department } = req.body;
        const userId = id || _id || `usr-${Date.now().toString().slice(-4)}`;
        const newUser = await User.create({
            _id: userId,
            name,
            email,
            role: role || 'Student',
            department
        });
        res.status(201).json({
            success: true,
            message: "User resource created successfully.",
            data: newUser
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// PUT /users/:id - Update user
exports.updateUser = async (req, res) => {
    try {
        const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                status: 404,
                error: "Not Found",
                message: `User with ID '${req.params.id}' was not found.`
            });
        }
        res.status(200).json({ success: true, message: "User updated successfully.", data: updatedUser });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// DELETE /users/:id - Delete user
exports.deleteUser = async (req, res) => {
    try {
        const deletedUser = await User.findByIdAndDelete(req.params.id);
        if (!deletedUser) {
            return res.status(404).json({
                success: false,
                status: 404,
                error: "Not Found",
                message: `User with ID '${req.params.id}' was not found.`
            });
        }
        res.status(200).json({ success: true, message: `User '${req.params.id}' deleted successfully.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
