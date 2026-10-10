// The demo database: a small shop whose keys show what the editor does with them — composite primary and foreign keys,
// a reference to the table itself, a table told apart by its row id alone, a view, an index, a check.

export const DEMO_DATABASE_SCRIPT = `
CREATE TABLE regions (
  country_code TEXT NOT NULL,
  region_code TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (country_code, region_code)
) WITHOUT ROWID;

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  country_code TEXT,
  region_code TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT customer_region FOREIGN KEY (country_code, region_code) REFERENCES regions (country_code, region_code)
);

CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT,
  manager_id INTEGER REFERENCES employees (id) ON DELETE SET NULL
);

CREATE TABLE products (
  sku TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT 1,
  photo BLOB
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers (id),
  sales_rep_id INTEGER REFERENCES employees (id),
  ordered_on DATE NOT NULL,
  note TEXT
);

CREATE TABLE order_lines (
  order_id INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  sku TEXT NOT NULL REFERENCES products (sku),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10, 2) NOT NULL,
  amount REAL GENERATED ALWAYS AS (quantity * unit_price) VIRTUAL,
  PRIMARY KEY (order_id, line_no)
);

CREATE TABLE shipments (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders (id),
  shipped_on DATE,
  carrier TEXT
);

CREATE TABLE shipment_items (
  shipment_id INTEGER NOT NULL REFERENCES shipments (id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL,
  line_no INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  PRIMARY KEY (shipment_id, order_id, line_no),
  CONSTRAINT shipped_line FOREIGN KEY (order_id, line_no) REFERENCES order_lines (order_id, line_no)
);

CREATE TABLE audit_log (
  happened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  message TEXT NOT NULL
);

CREATE INDEX orders_by_customer ON orders (customer_id, ordered_on DESC);
CREATE INDEX customers_by_lower_name ON customers (lower(name));

CREATE VIEW order_totals AS
  SELECT o.id AS order_id, c.name AS customer, o.ordered_on, sum(l.quantity * l.unit_price) AS total
  FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN order_lines l ON l.order_id = o.id
  GROUP BY o.id;

CREATE TRIGGER orders_logged AFTER INSERT ON orders
BEGIN
  INSERT INTO audit_log (message) VALUES ('order ' || NEW.id || ' placed');
END;

INSERT INTO regions VALUES
  ('DE', 'BE', 'Berlin'), ('DE', 'BY', 'Bavaria'), ('DE', 'HH', 'Hamburg'),
  ('US', 'CA', 'California'), ('US', 'NY', 'New York'), ('US', 'WA', 'Washington'),
  ('UA', 'KY', 'Kyiv'), ('UA', 'LV', 'Lviv');

INSERT INTO customers (id, name, email, country_code, region_code, created_at) VALUES
  (1, 'Anna Schmidt', 'anna@example.com', 'DE', 'BE', '2026-01-12 09:30:00'),
  (2, 'Ben Fischer', 'ben@example.com', 'DE', 'BY', '2026-02-03 14:05:00'),
  (3, 'Carla Diaz', 'carla@example.com', 'US', 'CA', '2026-02-20 18:45:00'),
  (4, 'David Lee', 'david@example.com', 'US', 'NY', '2026-03-08 11:10:00'),
  (5, 'Olena Koval', 'olena@example.com', 'UA', 'KY', '2026-03-15 08:00:00'),
  (6, 'Ivan Bondar', NULL, 'UA', 'LV', '2026-04-01 16:20:00'),
  (7, 'Emma Wilson', 'emma@example.com', 'US', 'WA', '2026-04-22 10:00:00'),
  (8, 'Felix Wagner', 'felix@example.com', NULL, NULL, '2026-05-05 12:30:00');

INSERT INTO employees (id, name, title, manager_id) VALUES
  (1, 'Grace Hopper', 'Director', NULL),
  (2, 'Alan Turing', 'Sales lead', 1),
  (3, 'Ada Lovelace', 'Sales', 2),
  (4, 'Edsger Dijkstra', 'Sales', 2),
  (5, 'Barbara Liskov', 'Warehouse lead', 1);

INSERT INTO products (sku, name, price, is_active) VALUES
  ('KB-01', 'Mechanical keyboard', 89.90, 1),
  ('MS-02', 'Wireless mouse', 29.50, 1),
  ('MN-27', '27" monitor', 249.00, 1),
  ('CB-USB', 'USB-C cable', 9.99, 1),
  ('HD-05', 'Headphones', 59.00, 1),
  ('WC-HD', 'Webcam HD', 45.00, 0);

INSERT INTO orders (id, customer_id, sales_rep_id, ordered_on, note) VALUES
  (1, 1, 3, '2026-06-01', NULL),
  (2, 1, 3, '2026-06-15', 'Gift wrap'),
  (3, 3, 4, '2026-06-20', NULL),
  (4, 5, 3, '2026-07-02', 'Call before delivery'),
  (5, 4, NULL, '2026-07-10', NULL),
  (6, 7, 4, '2026-08-05', NULL);

INSERT INTO order_lines (order_id, line_no, sku, quantity, unit_price) VALUES
  (1, 1, 'KB-01', 1, 89.90), (1, 2, 'MS-02', 2, 29.50),
  (2, 1, 'MN-27', 1, 249.00),
  (3, 1, 'HD-05', 1, 59.00), (3, 2, 'CB-USB', 3, 9.99), (3, 3, 'MS-02', 1, 29.50),
  (4, 1, 'KB-01', 2, 85.00),
  (5, 1, 'MN-27', 2, 239.00), (5, 2, 'CB-USB', 2, 9.99),
  (6, 1, 'HD-05', 1, 59.00);

INSERT INTO shipments (id, order_id, shipped_on, carrier) VALUES
  (1, 1, '2026-06-02', 'DHL'),
  (2, 3, '2026-06-21', 'UPS'),
  (3, 3, '2026-06-25', 'UPS'),
  (4, 5, '2026-07-11', 'FedEx');

INSERT INTO shipment_items (shipment_id, order_id, line_no, quantity) VALUES
  (1, 1, 1, 1), (1, 1, 2, 2),
  (2, 3, 1, 1), (2, 3, 2, 3),
  (3, 3, 3, 1),
  (4, 5, 1, 2), (4, 5, 2, 2);
`;
