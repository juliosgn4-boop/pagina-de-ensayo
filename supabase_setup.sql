-- ============================================================
-- DELGADO & AVELLANEDA — Sistema de Gestión de Expedientes
-- Ejecuta este script en el SQL Editor de Supabase
-- ============================================================

-- 1. TABLA DE PERFILES (extiende auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email       TEXT NOT NULL,
  full_name   TEXT,
  role        TEXT DEFAULT 'admin',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TABLA DE EXPEDIENTES
CREATE TABLE IF NOT EXISTS public.expedientes (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre           TEXT NOT NULL,
  cliente          TEXT,
  numero_radicado  TEXT,
  descripcion      TEXT,
  estado           TEXT DEFAULT 'activo' CHECK (estado IN ('activo', 'cerrado', 'archivado')),
  created_by       UUID REFERENCES public.profiles(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 3. TABLA DE ARCHIVOS
CREATE TABLE IF NOT EXISTS public.archivos (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  expediente_id       UUID REFERENCES public.expedientes(id) ON DELETE CASCADE,
  nombre              TEXT NOT NULL,
  nombre_original     TEXT NOT NULL,
  storage_path        TEXT NOT NULL,
  tipo_mime           TEXT,
  extension           TEXT,
  tamano              BIGINT DEFAULT 0,
  notas               TEXT,
  firmado             BOOLEAN DEFAULT FALSE,
  firma_storage_path  TEXT,
  firmado_por         UUID REFERENCES public.profiles(id),
  firmado_at          TIMESTAMPTZ,
  uploaded_by         UUID REFERENCES public.profiles(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expedientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archivos    ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Expedientes (solo usuarios autenticados)
CREATE POLICY "expedientes_all" ON public.expedientes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Archivos (solo usuarios autenticados)
CREATE POLICY "archivos_all" ON public.archivos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- FUNCIÓN: Auto-crear perfil al registrar usuario
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- FUNCIÓN: Auto-actualizar updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER expedientes_updated_at
  BEFORE UPDATE ON public.expedientes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER archivos_updated_at
  BEFORE UPDATE ON public.archivos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('expedientes-archivos', 'expedientes-archivos', false, 104857600),
  ('firmas', 'firmas', false, 5242880)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage
CREATE POLICY "storage_archivos_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'expedientes-archivos');
CREATE POLICY "storage_archivos_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'expedientes-archivos');
CREATE POLICY "storage_archivos_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'expedientes-archivos');

CREATE POLICY "storage_firmas_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'firmas');
CREATE POLICY "storage_firmas_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'firmas');
CREATE POLICY "storage_firmas_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'firmas');
