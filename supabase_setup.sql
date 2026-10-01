-- ========================================================
-- GLITCHLAB - SCRIPT DE INICIALIZACIÓN PARA SUPABASE CLOUD
-- Ejecuta este script en tu proyecto de Supabase:
-- 1. Ve a Supabase Console (https://supabase.com/dashboard)
-- 2. Selecciona tu proyecto
-- 3. Ve a "SQL Editor" en el menú izquierdo -> "New query"
-- 4. Pega todo este código y haz clic en "Run"
-- ========================================================

-- 1. TABLA DE CLIENTES
CREATE TABLE IF NOT EXISTS public.clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  total_orders INTEGER DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLA DE ÓRDENES DE SERVICIO
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY,
  date TIMESTAMPTZ DEFAULT NOW(),
  delivered_date TIMESTAMPTZ,
  warranty_days INTEGER DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'received',
  client JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_id TEXT REFERENCES public.clients(id) ON DELETE SET NULL,
  equipment JSONB NOT NULL DEFAULT '{}'::jsonb,
  issue TEXT,
  initial_diagnosis TEXT,
  technician TEXT,
  costs JSONB NOT NULL DEFAULT '{}'::jsonb,
  signature TEXT,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  bitacora JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. HABILITAR SEGURIDAD POR FILAS (RLS)
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Políticas para lectura y escritura desde la aplicación web (clave anon)
DROP POLICY IF EXISTS "Permitir todo anon en clients" ON public.clients;
CREATE POLICY "Permitir todo anon en clients" ON public.clients FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo anon en orders" ON public.orders;
CREATE POLICY "Permitir todo anon en orders" ON public.orders FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. BUCKET DE ALMACENAMIENTO PARA FOTOS DE ÓRDENES (STORAGE)
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-photos', 'order-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas de Storage para fotos (Lectura pública y subida con clave anon)
DROP POLICY IF EXISTS "Fotos lectura publica" ON storage.objects;
CREATE POLICY "Fotos lectura publica" ON storage.objects FOR SELECT TO public USING (bucket_id = 'order-photos');

DROP POLICY IF EXISTS "Fotos subida anon" ON storage.objects;
CREATE POLICY "Fotos subida anon" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'order-photos');

DROP POLICY IF EXISTS "Fotos borrado anon" ON storage.objects;
CREATE POLICY "Fotos borrado anon" ON storage.objects FOR DELETE TO public USING (bucket_id = 'order-photos');
