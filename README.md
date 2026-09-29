# Lab 7: API Gateway, Configuration-Based Service Discovery & Cloud Deployment

## 🚀 1. Project Overview & Lab 7 Objectives

In **Lab 6**, the CampusConnect application was decomposed into three independent microservices (`user-service`, `product-service`, `order-service`) communicating directly over a Docker network, but with individual host ports exposed directly to external clients and service URLs hard-coded.

**Lab 7** transitions this backend into an enterprise-ready, cloud-deployable architecture by implementing:
1. **Real API Gateway (`api-gateway`):** A unified reverse-proxy entry point built with Express and `http-proxy-middleware` that routes client requests, centralizes request logging, provides a `GET /health` endpoint, and handles backend service outages with clean HTTP 502 Bad Gateway responses.
2. **Configuration-Based Service Discovery:** Backend service locations are completely externalized into environment variables (`USER_SERVICE_URL`, `PRODUCT_SERVICE_URL`, `ORDER_SERVICE_URL`). The gateway dynamically constructs its routing table at startup without hard-coding URLs inside route handlers.
3. **Strict Network & Port Isolation:** In Docker Compose, **only** the API Gateway's port (`3000:3000`) is exposed externally. All three microservices and their dedicated MongoDB instances are sealed inside the internal Docker network (`campus-network`).
4. **Cloud Deployment Preparation (Render & MongoDB Atlas):** Full readiness for multi-service cloud deployment on Render connected to cloud-hosted MongoDB Atlas clusters.

---

## 🏛️ 2. System Architecture

```text
=================================================================================================================
                                     LAB 7 SYSTEM ARCHITECTURE
=================================================================================================================

                                      [ Client / Postman / Web App ]
                                                    |
                                                    | (http://localhost:3000 or Public Cloud HTTPS)
                                                    v
                                      +---------------------------+
                                      |        API GATEWAY        |
                                      |        (Port 3000)        |
                                      |  GET /health, /users/*,   |
                                      |  /products/*, /orders/*   |
                                      +-------------+-------------+
                                                    |
                                                    | Service Discovery (Environment Configuration)
                                                    | (USER_SERVICE_URL, PRODUCT_SERVICE_URL, ORDER_SERVICE_URL)
                                                    v
+===============================================================================================================+
|                                    DOCKER NETWORK / CLOUD PRIVATE VPC                                         |
|                                         (campus-network)                                                       |
|                                                                                                               |
|   +-----------------------+           +-----------------------+           +-------------------------------+   |
|   |     user-service      |           |    product-service    |           |        order-service          |   |
|   |      (Port 3001)      |           |      (Port 3002)      |           |          (Port 3003)          |   |
|   |   (Internal Network)  |           |   (Internal Network)  |           |       (Internal Network)      |   |
|   |       /users/*        |           |      /products/*      |           |           /orders/*           |   |
|   +-----------+-----------+           +-----------+-----------+           +---------------+---------------+   |
|               ^                                   ^                                       |                       |
|               |                                   |                                       |                       |
|               |  GET http://user-service:3001/users/:id                           |                       |
|               +<------------------------------------------------------------------┤                       |
|                                                   |                               |                       |
|                                                   | GET http://product-service:3002/products/:id           |
|                                                   +<------------------------------┘                       |
|               |                                   |                                       |                       |
|               v                                   v                                       v                       |
|   +-----------------------+           +-----------------------+           +-------------------------------+   |
|   |      mongo-user       |           |     mongo-product     |           |          mongo-order          |   |
|   |   (Internal Port)     |           |   (Internal Port)     |           |       (Internal Port)         |   |
|   |      Port: 27017      |           |      Port: 27017      |           |          Port: 27017          |   |
|   | Database: user_db /   |           | Database: product_db/ |           | Database: order_db /          |   |
|   |   MongoDB Atlas       |           |    MongoDB Atlas      |           |     MongoDB Atlas             |   |
|   +-----------------------+           +-----------------------+           +-------------------------------+   |
|                                                                                                               |
+===============================================================================================================+
```

---

## 📋 3. Gateway Routing Table

| Gateway Endpoint | Proxied Backend Target | Internal URL (Docker Compose) | Example Client Request |
| :--- | :--- | :--- | :--- |
| `GET /health` | API Gateway itself (Local) | *No proxying* | `GET http://localhost:3000/health` |
| `/users`, `/users/*` | User Service | `http://user-service:3001` | `GET http://localhost:3000/users` |
| `/products`, `/products/*` | Product Service | `http://product-service:3002` | `GET http://localhost:3000/products/prd-501` |
| `/orders`, `/orders/*` | Order Service | `http://order-service:3003` | `POST http://localhost:3000/orders` |

---

## ❓ 4. Architectural Discussion & Theory

### Part A Discussion: Why introduce an API Gateway instead of letting clients call each service directly?

1. **Single Entry Point & Decoupled Client Contracts:** External clients need to know only a single base URL. Clients are shielded from changes to internal service topologies, hostnames, port numbers, or protocol migrations.
2. **Security & Attack Surface Reduction:** Direct external access to individual business services and internal database containers is blocked. Only the gateway's port is exposed, enabling centralized enforcement of security policies.
3. **Centralized Cross-Cutting Concerns:** Shared concerns—such as request logging, authentication/token validation, rate limiting, and standard HTTP 502/503 error formatting—are handled at the gateway layer rather than duplicated across every microservice.
4. **Simplified CORS Configuration:** Instead of configuring and maintaining CORS headers across every independent microservice, CORS is managed centrally at the gateway.

---

### Part B Discussion: Static (Config-Based) vs. Dynamic Service Discovery

| Feature | Static / Configuration-Based (Lab 7) | Dynamic Service Discovery (Consul, Eureka, K8s DNS) |
| :--- | :--- | :--- |
| **Discovery Mechanism** | Environment variables (`USER_SERVICE_URL`, etc.) loaded at startup | Active registry service with continuous heartbeat checks and DNS/API lookup |
| **Operational Overhead** | Minimal; zero extra server infrastructure needed | Requires running dedicated discovery clusters (e.g. Consul/Eureka/K8s control plane) |
| **Auto-Scaling Support** | Fixed targets; requires restart/re-deploy to add instances | Automatically registers and deregisters container replicas dynamically |
| **Load Balancing** | Handled externally or limited to single target per env var | Client-side/Server-side round-robin load balancing across all healthy replicas |
| **Failure Detection** | Passive (gateway catches request failure on invocation) | Active real-time health-probe deregistration before requests are routed |

#### What Dynamic Discovery Adds:
Dynamic service discovery adds **automated instance lifecycle management**, **instant node deregistration on crash**, **automatic traffic distribution across $N$ replicas**, and **zero-downtime rolling updates** without needing manual configuration edits.

---

## ⚙️ 5. Configuration-Based Discovery Implementation & Proof

### Implementation in `api-gateway/server.js`

```javascript
// Validate required service discovery variables at startup
const requiredEnvVars = ['USER_SERVICE_URL', 'PRODUCT_SERVICE_URL', 'ORDER_SERVICE_URL'];
const missingEnvVars = requiredEnvVars.filter(key => !process.env[key] || process.env[key].trim() === '');

if (missingEnvVars.length > 0) {
    console.error('❌ [API-GATEWAY CONFIGURATION ERROR] Missing required environment variables');
    process.exit(1);
}

const USER_SERVICE_URL = process.env.USER_SERVICE_URL.trim();
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL.trim();
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL.trim();

// Construct proxy routes dynamically using configuration values
app.use('/users', createProxyMiddleware(buildProxyOptions(USER_SERVICE_URL, 'User Service')));
app.use('/products', createProxyMiddleware(buildProxyOptions(PRODUCT_SERVICE_URL, 'Product Service')));
app.use('/orders', createProxyMiddleware(buildProxyOptions(ORDER_SERVICE_URL, 'Order Service')));
```

### Step-by-Step Proof of Location Change Without Code Modification

To prove that service discovery is entirely configuration-driven without touching JavaScript application code:

1. **Initial State (Config A):**
   In `compose.yaml`:
   ```yaml
   USER_SERVICE_URL: http://user-service:3001
   ```
   Execute `GET http://localhost:3000/health`. Response confirms:
   ```json
   {
     "status": "UP",
     "serviceDiscovery": {
       "routingTable": {
         "/users": "http://user-service:3001"
       }
     }
   }
   ```

2. **Changed Configuration (Config B):**
   Update the environment variable in `compose.yaml` (e.g. point to an updated service or port):
   ```yaml
   USER_SERVICE_URL: http://user-service-v2:3010
   ```
   Restart the gateway:
   ```bash
   docker compose up -d api-gateway
   ```

3. **Verification:**
   Execute `GET http://localhost:3000/health`. The gateway automatically routes according to the new configuration:
   ```json
   {
     "status": "UP",
     "serviceDiscovery": {
       "routingTable": {
         "/users": "http://user-service-v2:3010"
       }
     }
   }
   ```
   **Result:** The routing destination changed entirely via environment configuration with **zero lines of code changed in `api-gateway/server.js`**.

---

## 🐳 6. Docker Compose & Port Exposure Verification

Canonical Compose file: [`compose.yaml`](file:///D:/DAU/Sem%203/WSSOA/LAB/LAB-7/compose.yaml)

```yaml
services:
  api-gateway:
    build: ./api-gateway
    container_name: api-gateway
    ports:
      - "3000:3000"  # ONLY Gateway port is exposed to host
    environment:
      PORT: 3000
      USER_SERVICE_URL: http://user-service:3001
      PRODUCT_SERVICE_URL: http://product-service:3002
      ORDER_SERVICE_URL: http://order-service:3003
    networks:
      - campus-network

  user-service:
    build: ./user-service
    container_name: user-service
    # No host port exposed - internal network access only
    environment:
      PORT: 3001
      MONGO_URI: mongodb://mongo-user:27017/user_db
    networks:
      - campus-network

  mongo-user:
    image: mongo
    container_name: mongo-user
    # No host port exposed - internal to campus-network
    volumes:
      - user-mongo-data:/data/db
    networks:
      - campus-network

  # (product-service, mongo-product, order-service, mongo-order follow identical port isolation)
```

### Local Docker Commands

```bash
# 1. Validate Compose configuration
docker compose config

# 2. Build and start complete stack in background
docker compose up --build -d

# 3. Verify running containers and port isolation
docker compose ps

# 4. View real-time logs across services
docker compose logs -f
```

---

## ☁️ 7. Render Cloud Deployment Guide & Environment Variables

### Cloud Architecture Overview
In cloud deployment (e.g. Render), each service runs as an independent Web Service container communicating over HTTPS, connected to a cloud-hosted MongoDB Atlas cluster.

### Required Cloud Environment Variables

| Service Name | Environment Variable | Purpose / Cloud Value Example |
| :--- | :--- | :--- |
| **`campusconnect-api-gateway`** | `PORT` | `10000` (Render default) |
| | `USER_SERVICE_URL` | `https://campusconnect-user-service.onrender.com` |
| | `PRODUCT_SERVICE_URL` | `https://campusconnect-product-service.onrender.com` |
| | `ORDER_SERVICE_URL` | `https://campusconnect-order-service.onrender.com` |
| **`campusconnect-user-service`** | `PORT` | `10000` |
| | `MONGO_URI` | `mongodb+srv://<user>:<password>@cluster0.mongodb.net/user_db?retryWrites=true&w=majority` |
| **`campusconnect-product-service`** | `PORT` | `10000` |
| | `MONGO_URI` | `mongodb+srv://<user>:<password>@cluster0.mongodb.net/product_db?retryWrites=true&w=majority` |
| **`campusconnect-order-service`** | `PORT` | `10000` |
| | `USER_SERVICE_URL` | `https://campusconnect-user-service.onrender.com` |
| | `PRODUCT_SERVICE_URL` | `https://campusconnect-product-service.onrender.com` |
| | `MONGO_URI` | `mongodb+srv://<user>:<password>@cluster0.mongodb.net/order_db?retryWrites=true&w=majority` |

### Render Deployment Sequence (Manual Execution Steps)

1. **Push Repository to GitHub:**
   Ensure all four service directories (`api-gateway`, `user-service`, `product-service`, `order-service`) and [`render.yaml`](file:///D:/DAU/Sem%203/WSSOA/LAB/LAB-7/render.yaml) are pushed to your GitHub repository.
2. **Deploy via Render Blueprint or Manual Web Services:**
   - Log in to the [Render Dashboard](https://dashboard.render.com).
   - Click **New +** $\rightarrow$ **Blueprint** $\rightarrow$ Select your GitHub repository (or create 4 individual Web Services).
3. **Configure Environment Variables in Dashboard:**
   - In each service settings, add the required `MONGO_URI` connection strings containing your MongoDB Atlas credentials.
   - Set the cross-service URLs in `api-gateway` and `order-service` to point to the generated Render public URLs.
4. **Deploy & Verify:**
   - Wait for builds to complete.
   - Test the public gateway URL: `https://campusconnect-api-gateway.onrender.com/health`.

---

## 🧪 8. Postman Testing & Verification

Collection file: [`Microservices_Lab_7.postman_collection.json`](file:///D:/DAU/Sem%203/WSSOA/LAB/LAB-7/Microservices_Lab_7.postman_collection.json)

Set the `gateway_url` collection variable:
- **For Local Docker:** `http://localhost:3000`
- **For Cloud Testing:** `https://campusconnect-api-gateway.onrender.com`

### Verification Endpoints & Expected Results

| Test Case | Method & Endpoint | Expected Status | Validation Note |
| :--- | :--- | :--- | :--- |
| **1. Gateway Health** | `GET {{gateway_url}}/health` | `200 OK` | Confirms gateway is UP and lists active discovery routing table. |
| **2. Get Users** | `GET {{gateway_url}}/users` | `200 OK` | Proxies to User Service; returns array of users. |
| **3. Get User By ID** | `GET {{gateway_url}}/users/usr-101` | `200 OK` | Returns details for `usr-101`. |
| **4. Create User** | `POST {{gateway_url}}/users` | `201 Created` | Creates new user record in database. |
| **5. Get Products** | `GET {{gateway_url}}/products` | `200 OK` | Proxies to Product Service; returns product catalog. |
| **6. Get Product By ID** | `GET {{gateway_url}}/products/prd-501` | `200 OK` | Returns details for `prd-501`. |
| **7. Create Product** | `POST {{gateway_url}}/products` | `201 Created` | Creates new product item. |
| **8. Create Order** | `POST {{gateway_url}}/orders` | `201 Created` | Order Service validates user and product via REST calls before creating order. |
| **9. Get Orders** | `GET {{gateway_url}}/orders` | `200 OK` | Proxies to Order Service; returns all confirmed orders. |
| **10. 502 Fault Test** | `GET {{gateway_url}}/products` (service down) | `502 Bad Gateway` | Gateway intercepts offline service and returns clean JSON 502 error. |

---

## 📝 9. Reflection (5–8 Lines)

Implementing the API Gateway and establishing cloud-readiness fundamentally shifted the operational and architectural maturity of our CampusConnect system compared to Lab 6. In Lab 6, clients directly targeted disparate ports across a multi-container environment, creating tight coupling and exposing internal infrastructure. In Lab 7, introducing the API Gateway established a single public front door that completely encapsulates the internal microservice topology while centralizing request logging and error handling. By decoupling service locations into environment-driven discovery, our services can transition from local Docker containers to cloud-hosted infrastructure without modifying a single line of application source code. Furthermore, sealing internal microservice and database ports within a private network perimeter ensures strict adherence to zero-trust security principles.

---

## 🛠️ 10. Troubleshooting Guide

1. **Issue: Missing environment variable causes Gateway startup failure**
   * **Symptom:** Gateway logs `❌ [API-GATEWAY CONFIGURATION ERROR]` and exits with code 1.
   * **Resolution:** Ensure `USER_SERVICE_URL`, `PRODUCT_SERVICE_URL`, and `ORDER_SERVICE_URL` are defined in `.env` or Compose configuration.
2. **Issue: 502 Bad Gateway when routing through Gateway**
   * **Symptom:** Gateway returns `HTTP 502 Bad Gateway: Target microservice is unreachable`.
   * **Resolution:** Check if backend containers are running (`docker compose ps`) and verify that service discovery URLs use Docker service names (`http://user-service:3001`), not `localhost`.
3. **Issue: Order creation fails with 503 Service Unavailable**
   * **Symptom:** Order Service returns `HTTP 503: User Service is currently unavailable`.
   * **Resolution:** Verify that `user-service` is online and that `USER_SERVICE_URL` in `order-service` environment is correctly configured.
