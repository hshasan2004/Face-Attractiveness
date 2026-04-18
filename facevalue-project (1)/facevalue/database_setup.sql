-- ============================================
-- FACEVALUE DATABASE SETUP
-- ============================================

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  avatar_url TEXT,
  age INTEGER,
  gender VARCHAR(20),
  country VARCHAR(100),
  role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create celebrities table
CREATE TABLE IF NOT EXISTS celebrities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  image_url TEXT,
  profile_image TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  bio TEXT,
  birth_date DATE,
  gender VARCHAR(20),
  profession VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create surveys table
CREATE TABLE IF NOT EXISTS surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  celebrity1_id UUID REFERENCES celebrities(id) ON DELETE CASCADE,
  celebrity2_id UUID REFERENCES celebrities(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  total_votes INTEGER DEFAULT 0,
  images_per_session INTEGER DEFAULT 100,
  evaluators_needed INTEGER DEFAULT 30,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create survey_responses table
CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  selected_celebrity_id UUID NOT NULL REFERENCES celebrities(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  comments TEXT,
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable Supabase Realtime for live leaderboard updates
ALTER PUBLICATION supabase_realtime ADD TABLE ratings;

-- Create results table
CREATE TABLE IF NOT EXISTS results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL UNIQUE REFERENCES surveys(id) ON DELETE CASCADE,
  celebrity1_votes INTEGER DEFAULT 0,
  celebrity2_votes INTEGER DEFAULT 0,
  total_responses INTEGER DEFAULT 0,
  percentage_1 DECIMAL(5, 2) DEFAULT 0,
  percentage_2 DECIMAL(5, 2) DEFAULT 0,
  winner_id UUID REFERENCES celebrities(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create feedback table
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
  title VARCHAR(255),
  message TEXT NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  is_resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create admin_logs table for audit trail
CREATE TABLE IF NOT EXISTS admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  target_table VARCHAR(50),
  target_id UUID,
  changes JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_celebrities_category_id ON celebrities(category_id);
CREATE INDEX IF NOT EXISTS idx_celebrities_is_active ON celebrities(is_active);
CREATE INDEX IF NOT EXISTS idx_surveys_is_active ON surveys(is_active);
CREATE INDEX IF NOT EXISTS idx_surveys_created_by ON surveys(created_by);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_id ON survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_user_id ON survey_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_created_at ON survey_responses(created_at);
CREATE INDEX IF NOT EXISTS idx_surveys_celebrity1_id ON surveys(celebrity1_id);
CREATE INDEX IF NOT EXISTS idx_surveys_celebrity2_id ON surveys(celebrity2_id);
CREATE INDEX IF NOT EXISTS idx_results_survey_id ON results(survey_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs(admin_id);

-- ============================================
-- ROW LEVEL SECURITY DISABLED FOR PERFORMANCE
-- ============================================
-- RLS is disabled; app-level security enforced in React via role checks

-- ============================================
-- RLS POLICIES DISABLED
-- ============================================
-- All RLS policies removed for maximum performance
-- Security is enforced at application level in React

-- ============================================
-- SAMPLE DATA (OPTIONAL - Uncomment to use)
-- ============================================

-- Insert categories
INSERT INTO categories (name, description) VALUES
  ('Actors', 'Movie and TV actors'),
  ('Musicians', 'Musicians and singers'),
  ('Athletes', 'Professional athletes'),
  ('Models', 'Fashion and supermodels'),
  ('Public Figures', 'Celebrities and public figures')
ON CONFLICT (name) DO NOTHING;

-- Sample celebrities (uncomment to add)
-- INSERT INTO celebrities (name, description, category_id, profession, bio) VALUES
--   ('Leonardo DiCaprio', 'Famous Hollywood actor', (SELECT id FROM categories WHERE name = 'Actors'), 'Actor', 'Academy Award-winning actor and environmental activist'),
--   ('Angelina Jolie', 'Acclaimed actress and filmmaker', (SELECT id FROM categories WHERE name = 'Actors'), 'Actress', 'Oscar winner known for diverse roles'),
--   ('Taylor Swift', 'Grammy award-winning singer', (SELECT id FROM categories WHERE name = 'Musicians'), 'Singer', 'Songwriter known for narrative storytelling in music'),
--   ('Cristiano Ronaldo', 'World-class footballer', (SELECT id FROM categories WHERE name = 'Athletes'), 'Footballer', 'Five-time Ballon d\'Or winner')
-- ON CONFLICT (name) DO NOTHING;

-- ============================================
-- ADMIN USERS (Create Supabase Auth accounts first, then run these)
-- ============================================
-- After creating users in Supabase Auth, insert their admin profiles:
-- INSERT INTO user_profiles (id, email, first_name, last_name, role)
-- VALUES (
--   (SELECT id FROM auth.users WHERE email = 'akhlas.cse@gmail.com'),
--   'akhlas.cse@gmail.com',
--   'Akhlas',
--   'Admin',
--   'admin'
-- );

-- INSERT INTO user_profiles (id, email, first_name, last_name, role)
-- VALUES (
--   (SELECT id FROM auth.users WHERE email = 'hshasan2004@gmail.com'),
--   'hshasan2004@gmail.com',
--   'Hasan',
--   'Admin',
--   'admin'
-- );

-- INSERT INTO user_profiles (id, email, first_name, last_name, role)
-- VALUES (
--   (SELECT id FROM auth.users WHERE email = 'khlas.cse@gmail.com'),
--   'khlas.cse@gmail.com',
--   'Khlas',
--   'Admin',
--   'admin'
-- );
