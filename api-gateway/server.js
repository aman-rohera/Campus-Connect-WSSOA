require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================================
// 1. CONFIGURATION-BASED SERVICE DISCOVERY (Startup Validation)
// ============================================================================
const requiredEnvVars = ['USER_SERVICE_URL', 'PRODUCT_SERVICE_URL', 'ORDER_SERVICE_URL'];
const missingEnvVars = requiredEnvVars.filter(key => !process.env[key] || process.env[key].trim() === '');

if (missingEnvVars.length > 0) {
    console.error('\n======================================================================');
    console.error('❌ [API-GATEWAY CONFIGURATION ERROR] Missing required environment variables:');
    missingEnvVars.forEach(v => console.error(`   • ${v} is missing or empty`));
    console.error('\nThe API Gateway requires all service discovery URLs to be defined at startup.');
    console.error('Please configure them in your environment or .env file.');
    console.error('Example (Docker Compose):');
    console.error('   USER_SERVICE_URL=http://user-service:3001');
    console.error('   PRODUCT_SERVICE_URL=http://product-service:3002');
    console.error('   ORDER_SERVICE_URL=http://order-service:3003');
    console.error('======================================================================\n');
    process.exit(1);
}

const USER_SERVICE_URL = process.env.USER_SERVICE_URL.trim();
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL.trim();
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL.trim();

// Enable CORS
app.use(cors());

// ============================================================================
// 2. CENTRALIZED REQUEST LOGGING MIDDLEWARE
// ============================================================================
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[API-GATEWAY LOG] ${timestamp} | ${req.method} ${req.originalUrl}`);
    next();
});

// ============================================================================
// 3. GATEWAY HEALTH CHECK ENDPOINT (Local to Gateway - No Proxying)
// ============================================================================
app.get('/health', (req, res) => {
    res.status(200).json({
        status: "UP",
        service: "api-gateway",
        timestamp: new Date().toISOString(),
        port: PORT,
        serviceDiscovery: {
            mode: "configuration-based",
            routingTable: {
                "/users": USER_SERVICE_URL,
                "/products": PRODUCT_SERVICE_URL,
                "/orders": ORDER_SERVICE_URL
            }
        }
    });
});

// ============================================================================
// 4. REVERSE PROXY ROUTE BUILDER WITH PATH PRESERVATION & 502/503 ERROR HANDLING
// ============================================================================
function buildProxyOptions(targetUrl, serviceName, routePrefix) {
    const errorHandler = (err, req, res) => {
        console.error(`[API-GATEWAY ERROR] Failed to route to ${serviceName} (${targetUrl}): ${err.message}`);
        if (res && !res.headersSent) {
            const body = JSON.stringify({
                success: false,
                error: "Bad Gateway",
                message: `Target microservice '${serviceName}' is unreachable or unavailable.`,
                targetService: targetUrl,
                serviceName: serviceName,
                statusCode: 502,
                timestamp: new Date().toISOString()
            });
            res.writeHead(502, {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            });
            res.end(body);
        }
    };

    const proxyReqHandler = (proxyReq, req, res) => {
        console.log(`[API-GATEWAY PROXY] Forwarding ${req.method} ${req.originalUrl} -> ${targetUrl}${proxyReq.path}`);
    };

    const proxyResHandler = (proxyRes, req, res) => {
        console.log(`[API-GATEWAY RESPONSE] ${serviceName} [Status: ${proxyRes.statusCode}] for ${req.method} ${req.originalUrl}`);
    };

    return {
        target: targetUrl,
        changeOrigin: true,
        // Preserve mount prefix path so /users, /products, /orders are forwarded accurately to backend services
        pathRewrite: (path, req) => {
            if (path === '' || path === '/') {
                return routePrefix;
            }
            if (path.startsWith('/?')) {
                return routePrefix + path.substring(1);
            }
            if (path.startsWith('?')) {
                return routePrefix + path;
            }
            return routePrefix + (path.startsWith('/') ? path : '/' + path);
        },
        onError: errorHandler,
        onProxyReq: proxyReqHandler,
        onProxyRes: proxyResHandler,
        on: {
            error: errorHandler,
            proxyReq: proxyReqHandler,
            proxyRes: proxyResHandler
        }
    };
}

// Register Config-Driven Service Proxy Routes with Path Preservation
app.use('/users', createProxyMiddleware(buildProxyOptions(USER_SERVICE_URL, 'User Service', '/users')));
app.use('/products', createProxyMiddleware(buildProxyOptions(PRODUCT_SERVICE_URL, 'Product Service', '/products')));
app.use('/orders', createProxyMiddleware(buildProxyOptions(ORDER_SERVICE_URL, 'Order Service', '/orders')));

// 404 Fallback for unmapped gateway paths
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "Not Found",
        message: `Route '${req.originalUrl}' is not registered on the API Gateway.`,
        availableEndpoints: [
            "GET /health",
            "/users",
            "/products",
            "/orders"
        ]
    });
});

app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 API Gateway operational on port ${PORT}`);
    console.log(`📡 Service Registry (Configuration-Based Discovery):`);
    console.log(`   • User Service:    ${USER_SERVICE_URL}`);
    console.log(`   • Product Service: ${PRODUCT_SERVICE_URL}`);
    console.log(`   • Order Service:   ${ORDER_SERVICE_URL}`);
    console.log(`🏥 Health Check:      http://localhost:${PORT}/health`);
    console.log(`=======================================================`);
});
