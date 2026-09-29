const Product = require('../models/Product');

// GET /products - Retrieve all products
exports.getAllProducts = async (req, res) => {
    try {
        const products = await Product.find();
        res.status(200).json({
            success: true,
            count: products.length,
            data: products
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// GET /products/:id - Retrieve product by ID
exports.getProductById = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({
                success: false,
                status: 404,
                error: "Not Found",
                message: `Product with ID '${req.params.id}' was not found.`
            });
        }
        res.status(200).json({ success: true, data: product });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// POST /products - Create new product
exports.createProduct = async (req, res) => {
    try {
        const { id, _id, name, description, price, stock, category } = req.body;
        const productId = id || _id || `prd-${Date.now().toString().slice(-4)}`;
        const newProduct = await Product.create({
            _id: productId,
            name,
            description,
            price,
            stock: stock !== undefined ? stock : 10,
            category: category || 'General'
        });
        res.status(201).json({
            success: true,
            message: "Product resource created successfully.",
            data: newProduct
        });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// PUT /products/:id - Update product
exports.updateProduct = async (req, res) => {
    try {
        const updatedProduct = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!updatedProduct) {
            return res.status(404).json({
                success: false,
                status: 404,
                error: "Not Found",
                message: `Product with ID '${req.params.id}' was not found.`
            });
        }
        res.status(200).json({ success: true, message: "Product updated successfully.", data: updatedProduct });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
};

// DELETE /products/:id - Delete product
exports.deleteProduct = async (req, res) => {
    try {
        const deletedProduct = await Product.findByIdAndDelete(req.params.id);
        if (!deletedProduct) {
            return res.status(404).json({
                success: false,
                status: 404,
                error: "Not Found",
                message: `Product with ID '${req.params.id}' was not found.`
            });
        }
        res.status(200).json({ success: true, message: `Product '${req.params.id}' deleted successfully.` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
