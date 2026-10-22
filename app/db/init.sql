-- Crea la tabla de usuarios y dos cuentas ficticias de prueba.
-- hash_contrasena almacena bcrypt con factor de costo 12.
-- El script es idempotente: puede ejecutarse en cada arranque.

CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    usuario VARCHAR(50) NOT NULL UNIQUE,
    hash_contrasena VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL
);

INSERT INTO usuarios (usuario, hash_contrasena, nombre)
VALUES
    ('ana.garcia', '$2a$12$kE7ze/Oe1HIqfxOkl17WD.zCv4nwOP4yiLgLYlBsnTAGnGp1u4wYa', 'Ana García'),
    ('luis.torres', '$2a$12$NtuXFzBYgOAi725LQiWcNOn2nr2b8hBMKj6.qG5eqX.xh3FBZajNS', 'Luis Torres')
ON CONFLICT (usuario) DO NOTHING;
