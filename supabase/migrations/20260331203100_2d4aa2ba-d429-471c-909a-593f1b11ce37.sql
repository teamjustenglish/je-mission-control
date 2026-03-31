
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role app_role NOT NULL DEFAULT 'moderator',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles table (for security-definer based checks)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- User roles policies
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Batches table
CREATE TABLE public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mod_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mods can view own batches" ON public.batches
  FOR SELECT USING (auth.uid() = mod_id);
CREATE POLICY "Admins can view all batches" ON public.batches
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Mods can insert own batches" ON public.batches
  FOR INSERT WITH CHECK (auth.uid() = mod_id);
CREATE POLICY "Mods can update own batches" ON public.batches
  FOR UPDATE USING (auth.uid() = mod_id);
CREATE POLICY "Mods can delete own batches" ON public.batches
  FOR DELETE USING (auth.uid() = mod_id);

-- Students table
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mods can view own students" ON public.students
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.batches WHERE batches.id = students.batch_id AND batches.mod_id = auth.uid())
  );
CREATE POLICY "Admins can view all students" ON public.students
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Mods can insert students" ON public.students
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.batches WHERE batches.id = students.batch_id AND batches.mod_id = auth.uid())
  );
CREATE POLICY "Mods can update students" ON public.students
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.batches WHERE batches.id = students.batch_id AND batches.mod_id = auth.uid())
  );
CREATE POLICY "Mods can delete students" ON public.students
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.batches WHERE batches.id = students.batch_id AND batches.mod_id = auth.uid())
  );

-- Attendance table
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  session_index INTEGER NOT NULL CHECK (session_index >= 0 AND session_index <= 23),
  state TEXT NOT NULL DEFAULT 'e' CHECK (state IN ('e', 'c', 'x')),
  UNIQUE (student_id, session_index)
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mods can view own attendance" ON public.attendance
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.batches WHERE batches.id = attendance.batch_id AND batches.mod_id = auth.uid())
  );
CREATE POLICY "Admins can view all attendance" ON public.attendance
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Mods can insert attendance" ON public.attendance
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.batches WHERE batches.id = attendance.batch_id AND batches.mod_id = auth.uid())
  );
CREATE POLICY "Mods can update attendance" ON public.attendance
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.batches WHERE batches.id = attendance.batch_id AND batches.mod_id = auth.uid())
  );
CREATE POLICY "Mods can delete attendance" ON public.attendance
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.batches WHERE batches.id = attendance.batch_id AND batches.mod_id = auth.uid())
  );

-- Demo days table
CREATE TABLE public.demo_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date DATE,
  day_number INTEGER NOT NULL CHECK (day_number IN (1, 2, 3))
);
ALTER TABLE public.demo_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mods can view own demo_days" ON public.demo_days
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.batches WHERE batches.id = demo_days.batch_id AND batches.mod_id = auth.uid())
  );
CREATE POLICY "Admins can view all demo_days" ON public.demo_days
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Mods can insert demo_days" ON public.demo_days
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.batches WHERE batches.id = demo_days.batch_id AND batches.mod_id = auth.uid())
  );
CREATE POLICY "Mods can update demo_days" ON public.demo_days
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.batches WHERE batches.id = demo_days.batch_id AND batches.mod_id = auth.uid())
  );
CREATE POLICY "Mods can delete demo_days" ON public.demo_days
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.batches WHERE batches.id = demo_days.batch_id AND batches.mod_id = auth.uid())
  );

-- Demo scores table
CREATE TABLE public.demo_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demo_day_id UUID NOT NULL REFERENCES public.demo_days(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  criterion TEXT NOT NULL,
  score NUMERIC(3,1) NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 4)
);
ALTER TABLE public.demo_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mods can view own demo_scores" ON public.demo_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.demo_days
      JOIN public.batches ON batches.id = demo_days.batch_id
      WHERE demo_days.id = demo_scores.demo_day_id AND batches.mod_id = auth.uid()
    )
  );
CREATE POLICY "Admins can view all demo_scores" ON public.demo_scores
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Mods can insert demo_scores" ON public.demo_scores
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.demo_days
      JOIN public.batches ON batches.id = demo_days.batch_id
      WHERE demo_days.id = demo_scores.demo_day_id AND batches.mod_id = auth.uid()
    )
  );
CREATE POLICY "Mods can update demo_scores" ON public.demo_scores
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.demo_days
      JOIN public.batches ON batches.id = demo_days.batch_id
      WHERE demo_days.id = demo_scores.demo_day_id AND batches.mod_id = auth.uid()
    )
  );
CREATE POLICY "Mods can delete demo_scores" ON public.demo_scores
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.demo_days
      JOIN public.batches ON batches.id = demo_days.batch_id
      WHERE demo_days.id = demo_scores.demo_day_id AND batches.mod_id = auth.uid()
    )
  );

-- Activity log table
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mod_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mod_name TEXT NOT NULL DEFAULT '',
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  batch_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mods can view own activity" ON public.activity_log
  FOR SELECT USING (auth.uid() = mod_id);
CREATE POLICY "Admins can view all activity" ON public.activity_log
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Mods can insert own activity" ON public.activity_log
  FOR INSERT WITH CHECK (auth.uid() = mod_id);

-- Settings table
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read settings for invite code validation" ON public.settings
  FOR SELECT USING (true);
CREATE POLICY "Admins can update settings" ON public.settings
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert settings" ON public.settings
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed invite code
INSERT INTO public.settings (key, value) VALUES ('invite_code', 'BATCH2026');

-- Trigger for auto-creating profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', ''), 'moderator');
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'moderator');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
