/**
 * Tipos de la base de datos.
 *
 * Escritos a mano a partir de las migraciones de supabase/migrations/.
 * Cuando el proyecto de Supabase esté creado, se regeneran con:
 *
 *     npm run tipos
 *
 * que ejecuta `supabase gen types typescript`. Hasta entonces este
 * archivo es la única fuente de tipos, y cualquier cambio de esquema
 * tiene que reflejarse acá en la misma migración.
 */

// ---------------------------------------------------------------------
// Enumerados (espejo de 20260815120100_enums.sql)
// ---------------------------------------------------------------------
export type RolUsuario = 'owner' | 'agent' | 'agency_admin' | 'moderator' | 'admin';
export type EstadoInmueble = 'available' | 'reserved' | 'sold' | 'rented' | 'withdrawn';
export type Operacion = 'sale' | 'rent' | 'project';
export type TipoInmueble =
  | 'apartment'
  | 'house'
  | 'land'
  | 'office'
  | 'commercial'
  | 'warehouse'
  | 'room'
  | 'country_house'
  | 'garage'
  | 'building';
export type Moneda = 'PEN' | 'USD';
export type EstadoPublicacion =
  'draft' | 'in_review' | 'published' | 'rejected' | 'paused' | 'expired';
export type EstadoVerificacion = 'unverified' | 'in_progress' | 'verified' | 'rejected';
export type PrivacidadDireccion = 'exact' | 'approximate' | 'district_only';
export type Amoblado = 'none' | 'partial' | 'full';
export type PoliticaMascotas = 'allowed' | 'not_allowed' | 'negotiable';
export type RolEnAgencia = 'agency_admin' | 'agent';
export type TipoMedio = 'photo' | 'video' | 'tour' | 'floor_plan';
export type EstadoConsulta = 'new' | 'read' | 'answered' | 'archived' | 'spam';
export type MotivoDenuncia =
  | 'duplicate'
  | 'wrong_price'
  | 'already_taken'
  | 'fake_photos'
  | 'scam'
  | 'wrong_location'
  | 'other';
export type EstadoDenuncia = 'open' | 'reviewing' | 'resolved' | 'dismissed';
export type EstadoSuscripcion = 'trialing' | 'active' | 'past_due' | 'canceled' | 'expired';
export type FrecuenciaAlerta = 'never' | 'instant' | 'daily' | 'weekly';
export type TipoTrabajoIA =
  | 'listing_draft'
  | 'photo_enhance'
  | 'virtual_staging'
  | 'video_tour'
  | 'price_estimate'
  | 'search_parse';
export type EstadoTrabajoIA = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

/** Lo que hace falta para insertar: unas pocas columnas obligatorias y el resto opcional. */
type Alta<T, Obligatorias extends keyof T> = Pick<T, Obligatorias> &
  Partial<Omit<T, Obligatorias>>;

// ---------------------------------------------------------------------
// Filas
// ---------------------------------------------------------------------

export type Perfil = {
  id: string;
  full_name: string;
  phone: string | null;
  whatsapp: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: RolUsuario;
  is_active: boolean;
  free_listings_used: number;
  created_at: string;
  updated_at: string;
};

export type Agencia = {
  id: string;
  name: string;
  slug: string;
  ruc: string | null;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
  verification_status: EstadoVerificacion;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type MiembroAgencia = {
  agency_id: string;
  user_id: string;
  role: RolEnAgencia;
  can_publish: boolean;
  joined_at: string;
};

export type Propiedad = {
  id: string;
  code: string;
  owner_id: string;
  agency_id: string | null;
  title: string;
  description: string;
  operation: Operacion;
  property_type: TipoInmueble;
  currency: Moneda;
  price: number;
  maintenance: number | null;
  /** Referencia en dólares. La calcula un trigger; no se envía nunca. */
  price_usd: number | null;
  price_usd_per_m2: number | null;
  total_area: number;
  built_area: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  age_years: number | null;
  furnished: Amoblado;
  pet_policy: PoliticaMascotas | null;
  address_privacy: PrivacidadDireccion;
  department: string;
  province: string;
  district: string;
  ubigeo: string | null;
  lat: number | null;
  lon: number | null;
  status: EstadoInmueble;
  publication_status: EstadoPublicacion;
  verification_status: EstadoVerificacion;
  rejection_reason: string | null;
  views_count: number;
  inquiries_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  expires_at: string | null;
  /** Columna generada por la base. Solo lectura. */
  price_per_m2: number | null;
};

export type UbicacionPropiedad = {
  property_id: string;
  address_line: string;
  urbanization: string | null;
  building_name: string | null;
  floor: string | null;
  interior: string | null;
  reference: string | null;
  exact_lat: number;
  exact_lon: number;
  created_at: string;
  updated_at: string;
};

export type CaracteristicaPropiedad = {
  property_id: string;
  feature: string;
  value: string | null;
};

export type MedioPropiedad = {
  id: string;
  property_id: string;
  kind: TipoMedio;
  url: string;
  storage_path: string | null;
  width: number | null;
  height: number | null;
  sort_order: number;
  is_cover: boolean;
  alt: string | null;
  ai_edited: boolean;
  original_media_id: string | null;
  ai_job_id: string | null;
  created_at: string;
  /** 'Imagen modificada con Wasi AI' cuando ai_edited. La genera la base. */
  ai_label: string | null;
};

export type Favorito = {
  user_id: string;
  property_id: string;
  note: string | null;
  created_at: string;
};

export type Consulta = {
  id: string;
  property_id: string;
  /** Lo fija un trigger a partir del aviso: no se envía. */
  owner_id: string;
  sender_id: string | null;
  sender_name: string;
  sender_email: string | null;
  sender_phone: string | null;
  message: string;
  status: EstadoConsulta;
  read_at: string | null;
  answered_at: string | null;
  created_at: string;
};

export type BusquedaGuardada = {
  id: string;
  user_id: string;
  name: string;
  filters: Json;
  alert_frequency: FrecuenciaAlerta;
  last_run_at: string | null;
  last_notified_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type HistorialPrecio = {
  id: number;
  property_id: string;
  price: number;
  currency: Moneda;
  price_usd: number | null;
  price_per_m2: number | null;
  changed_by: string | null;
  changed_at: string;
};

export type VistaAviso = {
  id: number;
  property_id: string;
  viewer_id: string | null;
  session_hash: string | null;
  source: string | null;
  viewed_at: string;
};

export type Denuncia = {
  id: string;
  property_id: string;
  reporter_id: string | null;
  reason: MotivoDenuncia;
  detail: string | null;
  status: EstadoDenuncia;
  resolved_by: string | null;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type Suscripcion = {
  id: string;
  user_id: string | null;
  agency_id: string | null;
  plan_code: string;
  status: EstadoSuscripcion;
  currency: Moneda;
  amount: number;
  listings_included: number;
  featured_included: number;
  starts_at: string;
  ends_at: string | null;
  auto_renew: boolean;
  canceled_at: string | null;
  provider: string | null;
  provider_ref: string | null;
  created_at: string;
  updated_at: string;
};

export type MovimientoCredito = {
  id: number;
  user_id: string | null;
  agency_id: string | null;
  amount: number;
  balance_after: number;
  reason: string;
  property_id: string | null;
  subscription_id: string | null;
  created_at: string;
};

export type TrabajoIA = {
  id: string;
  property_id: string | null;
  user_id: string;
  kind: TipoTrabajoIA;
  status: EstadoTrabajoIA;
  input: Json;
  output: Json | null;
  error: string | null;
  provider: string | null;
  model: string | null;
  cost_credits: number;
  accepted_at: string | null;
  accepted_by: string | null;
  discarded_at: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type RegistroAuditoria = {
  id: number;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: Json | null;
  after: Json | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

export type TipoCambio = {
  day: string;
  pen_per_usd: number;
  source: string;
  created_at: string;
};

/** Ficha pública del anunciante: sin teléfono ni correo. */
export type Anunciante = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: RolUsuario;
  created_at: string;
};

// ---------------------------------------------------------------------
// Esquema para el cliente de Supabase
// ---------------------------------------------------------------------
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Perfil;
        Insert: Alta<Perfil, 'id' | 'full_name'>;
        Update: Partial<Perfil>;
      };
      agencies: {
        Row: Agencia;
        Insert: Alta<Agencia, 'name' | 'slug' | 'created_by'>;
        Update: Partial<Agencia>;
      };
      agency_members: {
        Row: MiembroAgencia;
        Insert: Alta<MiembroAgencia, 'agency_id' | 'user_id'>;
        Update: Partial<MiembroAgencia>;
      };
      properties: {
        Row: Propiedad;
        Insert: Alta<
          Propiedad,
          | 'owner_id'
          | 'title'
          | 'description'
          | 'operation'
          | 'property_type'
          | 'currency'
          | 'price'
          | 'total_area'
          | 'department'
          | 'province'
          | 'district'
        >;
        Update: Partial<Propiedad>;
      };
      property_locations: {
        Row: UbicacionPropiedad;
        Insert: Alta<
          UbicacionPropiedad,
          'property_id' | 'address_line' | 'exact_lat' | 'exact_lon'
        >;
        Update: Partial<UbicacionPropiedad>;
      };
      property_features: {
        Row: CaracteristicaPropiedad;
        Insert: Alta<CaracteristicaPropiedad, 'property_id' | 'feature'>;
        Update: Partial<CaracteristicaPropiedad>;
      };
      property_media: {
        Row: MedioPropiedad;
        Insert: Alta<MedioPropiedad, 'property_id' | 'url'>;
        Update: Partial<MedioPropiedad>;
      };
      favorites: {
        Row: Favorito;
        Insert: Alta<Favorito, 'user_id' | 'property_id'>;
        Update: Partial<Favorito>;
      };
      inquiries: {
        Row: Consulta;
        Insert: Alta<Consulta, 'property_id' | 'sender_name' | 'message'>;
        Update: Partial<Consulta>;
      };
      saved_searches: {
        Row: BusquedaGuardada;
        Insert: Alta<BusquedaGuardada, 'user_id' | 'name'>;
        Update: Partial<BusquedaGuardada>;
      };
      price_history: {
        Row: HistorialPrecio;
        Insert: Alta<HistorialPrecio, 'property_id' | 'price' | 'currency'>;
        Update: Partial<HistorialPrecio>;
      };
      listing_views: {
        Row: VistaAviso;
        Insert: Alta<VistaAviso, 'property_id'>;
        Update: Partial<VistaAviso>;
      };
      reports: {
        Row: Denuncia;
        Insert: Alta<Denuncia, 'property_id' | 'reason'>;
        Update: Partial<Denuncia>;
      };
      subscriptions: {
        Row: Suscripcion;
        Insert: Alta<Suscripcion, 'plan_code' | 'amount'>;
        Update: Partial<Suscripcion>;
      };
      credit_transactions: {
        Row: MovimientoCredito;
        Insert: Alta<MovimientoCredito, 'amount' | 'balance_after' | 'reason'>;
        Update: Partial<MovimientoCredito>;
      };
      ai_jobs: {
        Row: TrabajoIA;
        Insert: Alta<TrabajoIA, 'user_id' | 'kind'>;
        Update: Partial<TrabajoIA>;
      };
      audit_logs: {
        Row: RegistroAuditoria;
        Insert: Alta<RegistroAuditoria, 'action' | 'entity'>;
        Update: Partial<RegistroAuditoria>;
      };
      exchange_rates: {
        Row: TipoCambio;
        Insert: Alta<TipoCambio, 'day' | 'pen_per_usd'>;
        Update: Partial<TipoCambio>;
      };
    };
    Views: {
      anunciantes: { Row: Anunciante };
    };
    Functions: {
      propiedades_cercanas: {
        Args: { p_lat: number; p_lon: number; p_radio_m?: number; p_limite?: number };
        Returns: (Pick<
          Propiedad,
          | 'id'
          | 'code'
          | 'title'
          | 'district'
          | 'operation'
          | 'property_type'
          | 'currency'
          | 'price'
          | 'price_usd'
          | 'price_per_m2'
        > & { distancia_m: number })[];
      };
    };
    Enums: {
      user_role: RolUsuario;
      property_status: EstadoInmueble;
      listing_operation: Operacion;
      property_type: TipoInmueble;
      currency: Moneda;
      publication_status: EstadoPublicacion;
      verification_status: EstadoVerificacion;
    };
  };
};
