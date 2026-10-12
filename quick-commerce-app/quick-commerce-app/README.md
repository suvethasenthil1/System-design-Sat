# QuickBasket — Round 3 Quick-Commerce Demo

A simple runnable food & grocery quick-commerce application demonstrating the Round 3 requirements with an Express.js API Gateway and a browser UI.

## Requirements
- Node.js 18+

## Run
1. Extract the ZIP.
2. Open a terminal in the extracted `quick-commerce-app` folder.
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000`

## Included functionality
- Search products (`GET /api/products/search?q=milk`)
- Check nearby inventory (`GET /api/inventory/nearby?productId=P101`)
- Add product to cart (`POST /api/carts/:cartId/items`)
- Place order and reserve stock (`POST /api/orders`)
- Assign a delivery partner and log events
- Get delivery status (`GET /api/orders/:orderId/delivery-status`)
- Search and inventory TTL caching (in-memory simulation)
- Event log for OrderPlaced, StockReserved, DeliveryAssigned, NotificationQueued
- Architecture view and scalability notes in the UI

## Sample API calls
```bash
curl "http://localhost:3000/api/products/search?q=milk"
curl "http://localhost:3000/api/inventory/nearby?productId=P101"
curl -X POST http://localhost:3000/api/carts/CART-DEMO-1/items -H "Content-Type: application/json" -d '{"productId":"P101","quantity":2,"storeId":"S101"}'
curl -X POST http://localhost:3000/api/orders -H "Content-Type: application/json" -d '{"cartId":"CART-DEMO-1","address":"Coimbatore, Tamil Nadu"}'
```

## Important scope note
This is an educational prototype: sample data, in-memory carts/orders/stock/cache, and a simulated event log. Restarting the server resets the data. The architecture panel explains the production equivalents: PostgreSQL for durable transactional data, Redis for shared cache/cart use, Kafka or RabbitMQ for durable asynchronous messaging, authentication, observability, and horizontal scaling behind a load balancer. Do not represent the demo as already using those production components.
