require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const orderRoutes = require('./routes/orders');
const Order = require('./models/Order');

const app = express();
const PORT = process.env.ORDER_SERVICE_PORT || process.env.PORT || 3003;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/order_db';
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`[ORDER-SERVICE] ${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
    next();
});

// Root Health Check Route
app.get('/', (req, res) => {
    res.status(200).json({
        service: "Order Service",
        port: PORT,
        status: "UP",
        dbStatus: mongoose.connection.readyState === 1 ? "CONNECTED" : "DISCONNECTED",
        database: "order_db",
        interServiceDependencies: {
            userServiceUrl: USER_SERVICE_URL,
            productServiceUrl: PRODUCT_SERVICE_URL
        },
        endpoints: {
            getAllOrders: "GET /orders",
            getOrderById: "GET /orders/:id",
            createOrder: "POST /orders (validates via User and Product REST APIs)"
        }
    });
});

app.use('/orders', orderRoutes);

async function connectDB() {
    let connected = false;
    let attempts = 0;
    while (!connected && attempts < 15) {
        try {
            attempts++;
            await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
            connected = true;
            console.log(`🍃 Order Service connected to MongoDB database: order_db at ${MONGO_URI}`);
            
            const count = await Order.countDocuments();
            if (count === 0) {
                await Order.create({
                    _id: "ord-901",
                    userId: "usr-101",
                    productId: "prd-501",
                    quantity: 1,
                    totalPrice: 1200,
                    status: "CONFIRMED",
                    userSnapshot: { name: "Aarav Patel", email: "aarav@example.com", department: "Computer Science" },
                    productSnapshot: { name: "High-Performance Laptop", price: 1200, category: "Electronics" }
                });
                console.log(`🌱 Initial order database seeded with 1 sample order (ord-901).`);
            }
        } catch (err) {
            console.error(`❌ Order Service Connection Attempt ${attempts}/15 failed: ${err.message}. Retrying in 2 seconds...`);
            await new Promise(res => setTimeout(res, 2000));
        }
    }
}

app.listen(PORT, async () => {
    console.log(`=======================================================`);
    console.log(`🚀 Order Service running on port ${PORT}`);
    console.log(`🔗 Target User Service:    ${USER_SERVICE_URL}`);
    console.log(`🔗 Target Product Service: ${PRODUCT_SERVICE_URL}`);
    console.log(`🔗 Resource Endpoint:      http://localhost:${PORT}/orders`);
    console.log(`=======================================================`);
    await connectDB();
});
