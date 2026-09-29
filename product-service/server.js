require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const productRoutes = require('./routes/products');
const Product = require('./models/Product');

const app = express();
const PORT = process.env.PRODUCT_SERVICE_PORT || process.env.PORT || 3002;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/product_db';

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`[PRODUCT-SERVICE] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
    next();
});

// Root Health Check Route
app.get('/', (req, res) => {
    res.status(200).json({
        service: "Product Service",
        port: PORT,
        status: "UP",
        dbStatus: mongoose.connection.readyState === 1 ? "CONNECTED" : "DISCONNECTED",
        database: "product_db",
        endpoints: {
            getAllProducts: "GET /products",
            getProductById: "GET /products/:id",
            createProduct: "POST /products",
            updateProduct: "PUT /products/:id",
            deleteProduct: "DELETE /products/:id"
        }
    });
});

app.use('/products', productRoutes);

async function connectDB() {
    let connected = false;
    let attempts = 0;
    while (!connected && attempts < 15) {
        try {
            attempts++;
            await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
            connected = true;
            console.log(`🍃 Product Service connected to MongoDB database: product_db at ${MONGO_URI}`);
            
            const count = await Product.countDocuments();
            if (count === 0) {
                await Product.insertMany([
                    { _id: "prd-501", name: "High-Performance Laptop", description: "16GB RAM, 512GB SSD, Intel i7", price: 1200, stock: 15, category: "Electronics" },
                    { _id: "prd-502", name: "5G Smartphone", description: "6.7-inch OLED, 128GB Storage", price: 800, stock: 25, category: "Electronics" },
                    { _id: "prd-503", name: "Noise Cancelling Headphones", description: "Wireless Bluetooth Over-Ear", price: 150, stock: 40, category: "Accessories" }
                ]);
                console.log(`🌱 Initial product database seeded with 3 sample products (prd-501, prd-502, prd-503).`);
            }
        } catch (err) {
            console.error(`❌ Product Service Connection Attempt ${attempts}/15 failed: ${err.message}. Retrying in 2 seconds...`);
            await new Promise(res => setTimeout(res, 2000));
        }
    }
}

app.listen(PORT, async () => {
    console.log(`=======================================================`);
    console.log(`🚀 Product Service running on port ${PORT}`);
    console.log(`🔗 Resource Endpoint: http://localhost:${PORT}/products`);
    console.log(`=======================================================`);
    await connectDB();
});
