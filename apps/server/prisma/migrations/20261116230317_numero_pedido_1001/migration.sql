-- Pedidos começam no número 1001
SELECT setval(pg_get_serial_sequence('"Order"', 'number'), GREATEST(1000, (SELECT COALESCE(MAX("number"), 0) FROM "Order")));
