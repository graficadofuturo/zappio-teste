-- DDL Completo para Supabase (Executar no SQL Editor do Supabase)

-- Habilitar a extensão pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Tabela de Usuários (Estende auth.users do Supabase)
CREATE TABLE public.users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  is_admin BOOLEAN DEFAULT FALSE
);

-- Habilitar RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para users
CREATE POLICY "Usuários podem ver seus próprios dados" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins podem ver todos os usuários" ON public.users FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
);

-- Trigger para criar o registro em public.users ao dar sign up, e verificar admins
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, is_admin)
  VALUES (
    new.id, 
    new.email, 
    new.email IN ('pedronatividade26@gmail.com', 'gbrielcn20@hotmail.com')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 2. Tabela de Assinaturas (Stripe)
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT,
  plan_id TEXT,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant vê sua própria assinatura" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins veem todas as assinaturas" ON public.subscriptions FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
);

-- 3. Tabela de Integrações de E-commerce
CREATE TABLE public.ecommerce_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('amazon', 'mercado_livre', 'shopee')),
  api_key TEXT,
  api_secret TEXT,
  affiliate_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ecommerce_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant controla suas chaves" ON public.ecommerce_keys FOR ALL USING (auth.uid() = user_id);

-- 4. Tabela de Instâncias de WhatsApp (Evolution API)
CREATE TABLE public.whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  instance_name TEXT NOT NULL,
  evolution_id TEXT,
  status TEXT DEFAULT 'disconnected',
  phone_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant controla suas instâncias" ON public.whatsapp_instances FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admins veem todas as instâncias" ON public.whatsapp_instances FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
);

-- 5. Tabela de Grupos/Contatos de WhatsApp
CREATE TABLE public.whatsapp_contacts_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('individual', 'group')),
  evolution_jid TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.whatsapp_contacts_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant controla seus contatos/grupos" ON public.whatsapp_contacts_groups FOR ALL USING (auth.uid() = user_id);

-- 6. Tabela de Campanhas
CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE NOT NULL,
  target_group_id UUID REFERENCES public.whatsapp_contacts_groups(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  image_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'completed', 'failed')),
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant controla suas campanhas" ON public.campaigns FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admins veem todas as campanhas" ON public.campaigns FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
);
