-- Drivers table
CREATE TABLE IF NOT EXISTS drivers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  license_number TEXT,
  license_state TEXT,
  license_expiry DATE,
  medical_card_expiry DATE,
  truck_id UUID REFERENCES trucks(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drivers_all" ON drivers FOR ALL USING (true) WITH CHECK (true);

-- Driver documents (license, medical card, other)
CREATE TABLE IF NOT EXISTS driver_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('license', 'medical_card', 'other')),
  label TEXT, -- custom name for 'other' type
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE driver_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "driver_documents_all" ON driver_documents FOR ALL USING (true) WITH CHECK (true);

-- Truck documents (license plate, cab card, truck picture, vin picture, other)
CREATE TABLE IF NOT EXISTS truck_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  truck_id UUID NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('license_plate', 'cab_card', 'truck_picture', 'vin_picture', 'other')),
  label TEXT, -- custom name for 'other' type
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE truck_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "truck_documents_all" ON truck_documents FOR ALL USING (true) WITH CHECK (true);

-- Trailers table
CREATE TABLE IF NOT EXISTS trailers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  number TEXT,
  type TEXT, -- e.g. dry van, flatbed, reefer
  truck_id UUID REFERENCES trucks(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE trailers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trailers_all" ON trailers FOR ALL USING (true) WITH CHECK (true);

-- Trailer documents
CREATE TABLE IF NOT EXISTS trailer_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trailer_id UUID NOT NULL REFERENCES trailers(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  label TEXT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE trailer_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trailer_documents_all" ON trailer_documents FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for company documents (drivers, trucks, trailers)
-- Run in Supabase dashboard: CREATE bucket 'company-docs' (public)
