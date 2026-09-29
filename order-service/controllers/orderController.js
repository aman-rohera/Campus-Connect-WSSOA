const Order = require('../models/Order');

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';

// Helper function for HTTP GET with timeout
async function fetchWithTimeout(url, timeoutMs = 4000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
    } catch (err) {
        clearTimeout(timeoutId);
        throw err;
    }
}

// GET /orders - Retrieve all orders
exports.getAllOrders = async (req, res) => {
    try {
        const orders = await Order.find();
        res.status(200).json({
            success: true,
            count: orders.length,
            data: orders
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// GET /orders/:id - Retrieve order by ID
exports.getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({
                success: false,
                status: 404,
                error: "Not Found",
                message: `Order with ID '${req.params.id}' was not found.`
            });
        }
        res.status(200).json({ success: true, data: order });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// POST /orders - Create order (Inter-Service REST validation call to User and Product Services)
exports.createOrder = async (req, res) => {
    const { userId, productId, quantity } = req.body;

    if (!userId || !productId) {
        return res.status(400).json({
            success: false,
            status: 400,
            error: "Bad Request",
            message: "Missing required fields: 'userId' and 'productId' are mandatory."
        });
    }

    const orderQty = quantity && quantity > 0 ? quantity : 1;

    // 1. Inter-Service Call: Order Service -> User Service
    let userData = null;
    try {
        const userUrl = `${USER_SERVICE_URL}/users/${userId}`;
        console.log(`[ORDER-SERVICE] Inter-service call: GET ${userUrl}`);
        const userRes = await fetchWithTimeout(userUrl);

        if (userRes.status === 404) {
            return res.status(404).json({
                success: false,
                status: 404,
                error: "Not Found",
                message: `Validation failed: User with ID '${userId}' does not exist.`
            });
        }

        if (!userRes.ok) {
            return res.status(userRes.status).json({
                success: false,
                status: userRes.status,
                error: "User Validation Error",
                message: `User Service returned HTTP status ${userRes.status}.`
            });
        }

        const userJson = await userRes.json();
        userData = userJson.data;
    } catch (err) {
        console.error(`[ORDER-SERVICE] User Service communication error:`, err.message);
        return res.status(503).json({
            success: false,
            status: 503,
            error: "Service Unavailable",
            message: `User Service (${USER_SERVICE_URL}) is currently unavailable or unreachable. Inter-service dependency failure.`,
            targetService: "User Service",
            serviceUrl: USER_SERVICE_URL
        });
    }

    // 2. Inter-Service Call: Order Service -> Product Service
    let productData = null;
    try {
        const productUrl = `${PRODUCT_SERVICE_URL}/products/${productId}`;
        console.log(`[ORDER-SERVICE] Inter-service call: GET ${productUrl}`);
        const productRes = await fetchWithTimeout(productUrl);

        if (productRes.status === 404) {
            return res.status(404).json({
                success: false,
                status: 404,
                error: "Not Found",
                message: `Validation failed: Product with ID '${productId}' does not exist.`
            });
        }

        if (!productRes.ok) {
            return res.status(productRes.status).json({
                success: false,
                status: productRes.status,
                error: "Product Validation Error",
                message: `Product Service returned HTTP status ${productRes.status}.`
            });
        }

        const productJson = await productRes.json();
        productData = productJson.data;
    } catch (err) {
        console.error(`[ORDER-SERVICE] Product Service communication error:`, err.message);
        return res.status(503).json({
            success: false,
            status: 503,
            error: "Service Unavailable",
            message: `Product Service (${PRODUCT_SERVICE_URL}) is currently unavailable or unreachable. Inter-service dependency failure.`,
            targetService: "Product Service",
            serviceUrl: PRODUCT_SERVICE_URL
        });
    }

    // 3. Create Order in Order Database
    try {
        const orderId = `ord-${Date.now().toString().slice(-4)}`;
        const totalPrice = productData.price * orderQty;

        const newOrder = await Order.create({
            _id: orderId,
            userId: userData._id,
            productId: productData._id,
            quantity: orderQty,
            totalPrice: totalPrice,
            status: "CONFIRMED",
            userSnapshot: {
                name: userData.name,
                email: userData.email,
                department: userData.department
            },
            productSnapshot: {
                name: productData.name,
                price: productData.price,
                category: productData.category
            }
        });

        res.status(201).json({
            success: true,
            message: "Order created successfully following inter-service verification.",
            interServiceCalls: {
                userService: `${USER_SERVICE_URL}/users/${userId} [HTTP 200 OK]`,
                productService: `${PRODUCT_SERVICE_URL}/products/${productId} [HTTP 200 OK]`
            },
            data: newOrder
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};
