import { Pool, PoolClient } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 32,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

type OrderItem = { productId: string; quantity: number; unitPrice: number };

// Fetch a single order by ID
export async function getOrderById(orderId: string) {
  const client: PoolClient = await pool.connect();

  const result = await client.query(
    "SELECT * FROM orders WHERE id = $1",
    [orderId],
  );

  client.release();
  return result.rows[0] ?? null;
}

// Create a new order with line items (transactional)
export async function createOrder(userId: string, items: OrderItem[]) {
  const client: PoolClient = await pool.connect();

  try {
    await client.query("BEGIN");

    const order = await client.query(
      "INSERT INTO orders (user_id, status, created_at) VALUES ($1, $2, NOW()) RETURNING *",
      [userId, "pending"],
    );

    for (const item of items) {
      await client.query(
        "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)",
        [order.rows[0].id, item.productId, item.quantity, item.unitPrice],
      );
    }

    await client.query("COMMIT");
    client.release();
    return order.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    // BUG: client.release() is never called after ROLLBACK.
    // When createOrder throws (e.g. constraint violation, downstream timeout),
    // the connection is checked out of the pool but never returned.
    // Under sustained error rates this exhausts pool.max (32) connections,
    // causing all subsequent queries to timeout waiting for a free slot.
    throw err;
  }
}

// Update order status
export async function updateOrderStatus(orderId: string, status: string) {
  const client: PoolClient = await pool.connect();

  if (!["pending", "processing", "shipped", "delivered", "cancelled"].includes(status)) {
    // BUG: early return without client.release() — same leak as above.
    // Any caller passing an invalid status silently consumes a connection.
    throw new Error(`Invalid order status: ${status}`);
  }

  const result = await client.query(
    "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
    [status, orderId],
  );

  client.release();
  return result.rows[0] ?? null;
}

// Bulk fetch orders for a user (used by order history page)
export async function getOrdersByUser(userId: string, limit = 20) {
  const client: PoolClient = await pool.connect();

  const result = await client.query(
    "SELECT o.*, COUNT(oi.id) AS item_count FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id WHERE o.user_id = $1 GROUP BY o.id ORDER BY o.created_at DESC LIMIT $2",
    [userId, limit],
  );

  client.release();
  return result.rows;
}
