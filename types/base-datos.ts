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
export type RolUsuario = 'buyer' | 'owner' | 'agent' | 'agency_admin' | 'moderator' | 'admin';
export type ContactoPreferido = 'whatsapp' | 'phone' | 'email';
export type IntencionUsuario = 'buy' | 'rent' | 'sell' | 'rent_out' | 'invest';
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
  'draft' | 'in_review' | 'published' | 'rejected' | 'paused' | 'expired' | 'archived';

/**
 * Aviso a medio llenar en el asistente de publicación.
 *
 * Vive fuera de `properties` porque un aviso sin título, sin precio y
 * sin distrito no puede entrar ahí: aflojar esas restricciones para
 * guardar borradores sería pagar la integridad de todos los avisos
 * publicados por poder guardar uno incompleto.
 */
export type BorradorGuardado = {
  id: string;
  user_id: string;
  agency_id: string | null;
  property_id: string | null;
  datos: Json;
  paso: number;
  created_at: string;
  updated_at: string;
};
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
  preferred_contact: ContactoPreferido;
  intent: IntencionUsuario | null;
  /** Fin de la bienvenida. Mientras sea null, el panel redirige a /bienvenida. */
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Distrito que le interesa a una persona: alimenta sus alertas. */
export type DistritoDeInteres = {
  user_id: string;
  district: string;
  province: string | null;
  department: string | null;
  created_at: string;
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
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  archived_at: string | null;
  price_dropped_at: string | null;
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
  /** El archivo tal como lo subieron. Nunca se borra mientras exista el aviso. */
  original_storage_path: string | null;
  original_bytes: number | null;
  bytes: number | null;
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

export type TipoConsulta = 'message' | 'visit';

export type TipoEventoLead =
  | 'phone_reveal'
  | 'whatsapp'
  | 'contact_form'
  | 'visit_request'
  | 'share'
  | 'compare'
  | 'favorite';

/** Interacción con un aviso. Sin datos personales: solo un hash de sesión. */
export type EventoLead = {
  id: number;
  property_id: string;
  kind: TipoEventoLead;
  session_hash: string | null;
  source: string | null;
  created_at: string;
};

export type Consulta = {
  id: string;
  property_id: string;
  kind: TipoConsulta;
  preferred_visit_at: string | null;
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

/** Rebaja de precio de un aviso publicado. */
export type RebajaDePrecio = {
  property_id: string;
  previous_price: number;
  previous_currency: Moneda;
  previous_price_usd: number | null;
  current_price: number;
  current_currency: Moneda;
  current_price_usd: number | null;
  drop_pct: number | null;
  dropped_at: string;
};

/** Precio por m² agregado por distrito y operación. */
export type IndiceDistrital = {
  department: string;
  province: string;
  district: string;
  operation: Operacion;
  listings: number;
  avg_usd_per_m2: number | null;
  median_usd_per_m2: number | null;
  min_usd_per_m2: number | null;
  max_usd_per_m2: number | null;
};

/** Distritos con avisos publicados, para los atajos de la portada. */
export type DistritoPopular = {
  department: string;
  province: string;
  district: string;
  listings: number;
  for_sale: number;
  for_rent: number;
  avg_usd_per_m2: number | null;
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
  // supabase-js usa esta marca para saber contra qué versión de PostgREST
  // están escritos los tipos. Sin ella, select() y update() devuelven `never`.
  __InternalSupabase: { PostgrestVersion: '13' };
  public: {
    Tables: {
      profiles: {
        Row: Perfil;
        Insert: Alta<Perfil, 'id' | 'full_name'>;
        Update: Partial<Perfil>;
        Relationships: [];
      };
      profile_districts: {
        Row: DistritoDeInteres;
        Insert: Alta<DistritoDeInteres, 'user_id' | 'district'>;
        Update: Partial<DistritoDeInteres>;
        Relationships: [];
      };
      agencies: {
        Row: Agencia;
        Insert: Alta<Agencia, 'name' | 'slug' | 'created_by'>;
        Update: Partial<Agencia>;
        Relationships: [];
      };
      agency_members: {
        Row: MiembroAgencia;
        Insert: Alta<MiembroAgencia, 'agency_id' | 'user_id'>;
        Update: Partial<MiembroAgencia>;
        Relationships: [];
      };
      listing_drafts: {
        Row: BorradorGuardado;
        Insert: Alta<BorradorGuardado, 'user_id'>;
        Update: Partial<BorradorGuardado>;
        Relationships: [];
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
        Relationships: [];
      };
      property_locations: {
        Row: UbicacionPropiedad;
        Insert: Alta<
          UbicacionPropiedad,
          'property_id' | 'address_line' | 'exact_lat' | 'exact_lon'
        >;
        Update: Partial<UbicacionPropiedad>;
        Relationships: [];
      };
      property_features: {
        Row: CaracteristicaPropiedad;
        Insert: Alta<CaracteristicaPropiedad, 'property_id' | 'feature'>;
        Update: Partial<CaracteristicaPropiedad>;
        Relationships: [];
      };
      property_media: {
        Row: MedioPropiedad;
        Insert: Alta<MedioPropiedad, 'property_id' | 'url'>;
        Update: Partial<MedioPropiedad>;
        Relationships: [];
      };
      favorites: {
        Row: Favorito;
        Insert: Alta<Favorito, 'user_id' | 'property_id'>;
        Update: Partial<Favorito>;
        Relationships: [];
      };
      lead_events: {
        Row: EventoLead;
        Insert: Alta<EventoLead, 'property_id' | 'kind'>;
        Update: Partial<EventoLead>;
        Relationships: [];
      };
      inquiries: {
        Row: Consulta;
        Insert: Alta<Consulta, 'property_id' | 'sender_name' | 'message'>;
        Update: Partial<Consulta>;
        Relationships: [];
      };
      saved_searches: {
        Row: BusquedaGuardada;
        Insert: Alta<BusquedaGuardada, 'user_id' | 'name'>;
        Update: Partial<BusquedaGuardada>;
        Relationships: [];
      };
      price_history: {
        Row: HistorialPrecio;
        Insert: Alta<HistorialPrecio, 'property_id' | 'price' | 'currency'>;
        Update: Partial<HistorialPrecio>;
        Relationships: [];
      };
      listing_views: {
        Row: VistaAviso;
        Insert: Alta<VistaAviso, 'property_id'>;
        Update: Partial<VistaAviso>;
        Relationships: [];
      };
      reports: {
        Row: Denuncia;
        Insert: Alta<Denuncia, 'property_id' | 'reason'>;
        Update: Partial<Denuncia>;
        Relationships: [];
      };
      subscriptions: {
        Row: Suscripcion;
        Insert: Alta<Suscripcion, 'plan_code' | 'amount'>;
        Update: Partial<Suscripcion>;
        Relationships: [];
      };
      credit_transactions: {
        Row: MovimientoCredito;
        Insert: Alta<MovimientoCredito, 'amount' | 'balance_after' | 'reason'>;
        Update: Partial<MovimientoCredito>;
        Relationships: [];
      };
      ai_jobs: {
        Row: TrabajoIA;
        Insert: Alta<TrabajoIA, 'user_id' | 'kind'>;
        Update: Partial<TrabajoIA>;
        Relationships: [];
      };
      audit_logs: {
        Row: RegistroAuditoria;
        Insert: Alta<RegistroAuditoria, 'action' | 'entity'>;
        Update: Partial<RegistroAuditoria>;
        Relationships: [];
      };
      exchange_rates: {
        Row: TipoCambio;
        Insert: Alta<TipoCambio, 'day' | 'pen_per_usd'>;
        Update: Partial<TipoCambio>;
        Relationships: [];
      };
    };
    Views: {
      anunciantes: { Row: Anunciante; Relationships: [] };
      listings_price_drops: { Row: RebajaDePrecio; Relationships: [] };
      district_price_index: { Row: IndiceDistrital; Relationships: [] };
      popular_districts: { Row: DistritoPopular; Relationships: [] };
    };
    Functions: {
      /** Consume un cupo del limitador. false cuando ya se pasó del límite. */
      consumir_cupo: {
        Args: {
          p_bucket: string;
          p_clave: string;
          p_limite: number;
          p_ventana_segundos?: number;
        };
        Returns: boolean;
      };
      /** Anota una interacción con el aviso. No guarda datos personales. */
      registrar_evento: {
        Args: {
          p_property_id: string;
          p_kind: TipoEventoLead;
          p_session_hash?: string | null;
          p_source?: string | null;
        };
        Returns: undefined;
      };
      /**
       * El teléfono de quien publica, de a uno y con el evento anotado.
       * Es la única forma de obtenerlo: la RLS de profiles no lo expone.
       */
      telefono_de_contacto: {
        Args: { p_property_id: string; p_session_hash?: string | null };
        Returns: { telefono: string | null; whatsapp: string | null; nombre: string }[];
      };
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
