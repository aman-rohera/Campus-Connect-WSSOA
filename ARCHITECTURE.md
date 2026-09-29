# Lab 7 Microservices Architecture: API Gateway, Service Discovery & Cloud Deployment

## 1. System Architecture Diagram

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

## 2. Layering & Responsibilities

| Layer | Responsibility | Reachability |
| :--- | :--- | :--- |
| **Client / Postman** | Sends requests to the single entry point. | Public Internet |
| **API Gateway** | Entry point; proxy routing (`/users`, `/products`, `/orders`); request logging; `GET /health`; centralized HTTP 502 Bad Gateway error handling. | Public (`:3000` / Cloud HTTPS) |
| **Service Registry (Config)** | Configuration-driven mapping of service targets via environment variables (`USER_SERVICE_URL`, `PRODUCT_SERVICE_URL`, `ORDER_SERVICE_URL`). | Internal to Gateway |
| **Microservices Layer** | Business logic for `user-service` (`:3001`), `product-service` (`:3002`), and `order-service` (`:3003`). | Internal Network (`campus-network`) Only |
| **Database Layer** | Database-per-service isolation (`user_db`, `product_db`, `order_db`) via internal MongoDB containers or MongoDB Atlas. | Microservices Only |

---

## 3. Key Architectural Boundaries & Principles

1. **Strict Single Entry Point:**
   Only the `api-gateway` port `3000` is exposed publicly to the host. Microservices and database containers have zero host port mappings.
2. **Decoupled Service Discovery:**
   Gateway discovers service locations exclusively through environment variables without hard-coded URLs in route handlers.
3. **Database-Per-Service Isolation:**
   Each microservice owns its database. Order Service validates users and products via inter-service REST calls (`GET http://user-service:3001/users/:id` and `GET http://product-service:3002/products/:id`) over `campus-network`.
4. **Fault Tolerance & Clean Error Responses:**
   If a backend microservice fails, the API Gateway returns a clean JSON `HTTP 502 Bad Gateway` response without crashing.
