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

/** Qué se le hizo a una foto. Lista cerrada: lo que no está, no se puede pedir. */
export type TipoEdicionMedio =
  | 'lighting'
  | 'white_balance'
  | 'perspective'
  | 'upscale'
  | 'staging'
  | 'style'
  | 'wall_color'
  | 'declutter';

export type PuestoDeWasipe = 'moderator' | 'support' | 'finance' | 'super_admin';
export type DecisionDeRevision = 'approve' | 'reject' | 'request_changes' | 'pause';
export type TipoDeBandera = 'duplicate' | 'suspicious_price' | 'repeated_image' | 'manual';
export type EstadoDeBandera = 'open' | 'dismissed' | 'confirmed';

export type PeriodoDeMercado = 'm3' | 'm6' | 'm12' | 'todo';

/**
 * Una fila del índice de precio por m².
 *
 * `sufficient` en false significa que no se llegó a la muestra mínima y
 * que NO hay cifra que publicar. `pen_per_usd` y `computed_at` van
 * siempre: sin ellos la cifra no se puede reproducir.
 */
export type EstadisticaDeMercado = {
  department: string;
  province: string;
  district: string;
  operation: Operacion;
  /** null es el corte «todos los tipos». */
  property_type: TipoInmueble | null;
  period: PeriodoDeMercado;
  listings: number;
  avg_usd_per_m2: number | null;
  median_usd_per_m2: number | null;
  p25_usd_per_m2: number | null;
  p75_usd_per_m2: number | null;
  min_usd_per_m2: number | null;
  max_usd_per_m2: number | null;
  median_price_usd: number | null;
  median_area: number | null;
  /** Cuántos avisos se dejaron fuera por atípicos. Se muestra. */
  outliers: number;
  sufficient: boolean;
  pen_per_usd: number;
  computed_at: string;
};

export type FormatoDeVideo = 'vertical' | 'square' | 'horizontal';
export type PlantillaDeVideo = 'modern' | 'premium' | 'minimal' | 'reel';
export type EstadoDeVideo =
  'queued' | 'rendering' | 'ready' | 'failed' | 'canceled' | 'expired';

/** Revisión de seguridad de moderación. 'blocked' oculta sin borrar. */
export type EstadoRevisionMedio =
  'not_required' | 'pending' | 'cleared' | 'flagged' | 'blocked';

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
  /**
   * La zona dentro del distrito, para poder buscar por ella.
   *
   * Es una copia de `property_locations.urbanization`, y vive acá porque
   * la búsqueda no toca esa tabla: ahí está la dirección exacta.
   *
   * Nula cuando quien publicó eligió mostrar solo el distrito. Una
   * urbanización acota de Miraflores entero a unas pocas cuadras, así que
   * copiarla igual sería desdecir esa elección.
   */
  urbanization: string | null;
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
  /** Qué edición se aplicó. Obligatoria en toda imagen editada. */
  edit_kind: TipoEdicionMedio | null;
  /** Amoblamiento virtual: cambia la etiqueta, porque promete otra cosa. */
  is_staged: boolean;
  review_status: EstadoRevisionMedio;
  review_reason: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  /** Lo que costó en el proveedor, en millonésimas de dólar. */
  provider_cost_micros: number | null;
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

/**
 * Una notificación de alerta ya emitida.
 *
 * Una fila por aviso avisado, no por correo: si una corrida encuentra
 * tres avisos nuevos quedan tres filas con el mismo . Eso es
 * lo que permite que la restricción única (búsqueda, aviso) impida
 * avisar dos veces de lo mismo.
 */
export type NotificacionDeAlerta = {
  id: number;
  busqueda_id: string;
  user_id: string;
  property_id: string;
  envio_id: string;
  estado: 'registrado' | 'enviado' | 'fallido';
  proveedor: string;
  error: string | null;
  asunto: string | null;
  cuerpo: string | null;
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
  /** Lo que la persona escribió. Los filtros son lo que se ejecuta. */
  prompt: string | null;
  operation: Operacion;
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
  /** La capacidad exacta dentro de la familia: 'titulo', 'descripcion'… */
  operation: string | null;
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
  /** Huella del pedido: dos iguales son el mismo trabajo. */
  idempotency_key: string | null;
  duration_ms: number | null;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
  provider_cost_micros: number | null;
  /** 0 a 100. Solo sube: un progreso que retrocede confunde. */
  progress: number;
  /** Créditos apartados al empezar. Un render que falla los devuelve. */
  reserved_credits: number;
  canceled_at: string | null;
  /** Identificador del render en el proveedor, para preguntarle cómo va. */
  provider_ref: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

/**
 * Un render de video del aviso.
 *
 * `facts` guarda lo que el video dice, congelado al renderizar: el aviso
 * puede cambiar de precio después y el archivo ya salió por WhatsApp.
 */
export type VideoDeAviso = {
  id: string;
  property_id: string;
  ai_job_id: string | null;
  created_by: string;
  format: FormatoDeVideo;
  template: PlantillaDeVideo;
  status: EstadoDeVideo;
  facts: Json;
  narration: string | null;
  music_track: string | null;
  captions: boolean;
  storage_path: string | null;
  poster_path: string | null;
  duration_ms: number | null;
  bytes: number | null;
  provider: string | null;
  provider_ref: string | null;
  provider_cost_micros: number | null;
  /** Un video con un precio viejo engaña: vencido no se descarga. */
  expires_at: string | null;
  downloads: number;
  last_downloaded_at: string | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

/** Un puesto dentro de Wasipe. Va aparte del rol de mercado de la cuenta. */
export type MiembroDelEquipo = {
  user_id: string;
  role: PuestoDeWasipe;
  granted_by: string | null;
  granted_at: string;
  note: string | null;
};

/** Una decisión de moderación. No se edita ni se borra. */
export type RevisionDeAviso = {
  id: number;
  property_id: string;
  reviewer_id: string;
  decision: DecisionDeRevision;
  reason: string | null;
  created_at: string;
};

/** Una señal para que alguien mire. Nunca despublica nada por su cuenta. */
export type BanderaDeModeracion = {
  id: number;
  property_id: string;
  kind: TipoDeBandera;
  detail: Json;
  score: number;
  status: EstadoDeBandera;
  resolved_by: string | null;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
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
      notificaciones_de_alerta: {
        Row: NotificacionDeAlerta;
        Insert: Alta<
          NotificacionDeAlerta,
          'busqueda_id' | 'user_id' | 'property_id' | 'envio_id'
        >;
        Update: Partial<NotificacionDeAlerta>;
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
      market_stats: {
        Row: EstadisticaDeMercado;
        Insert: Alta<
          EstadisticaDeMercado,
          | 'department'
          | 'province'
          | 'district'
          | 'operation'
          | 'period'
          | 'listings'
          | 'pen_per_usd'
        >;
        Update: Partial<EstadisticaDeMercado>;
        Relationships: [];
      };
      property_videos: {
        Row: VideoDeAviso;
        Insert: Alta<VideoDeAviso, 'property_id' | 'created_by' | 'format' | 'template'>;
        Update: Partial<VideoDeAviso>;
        Relationships: [];
      };
      staff_members: {
        Row: MiembroDelEquipo;
        Insert: Alta<MiembroDelEquipo, 'user_id' | 'role'>;
        Update: Partial<MiembroDelEquipo>;
        Relationships: [];
      };
      listing_reviews: {
        Row: RevisionDeAviso;
        Insert: Alta<RevisionDeAviso, 'property_id' | 'reviewer_id' | 'decision'>;
        Update: Partial<RevisionDeAviso>;
        Relationships: [];
      };
      moderation_flags: {
        Row: BanderaDeModeracion;
        Insert: Alta<BanderaDeModeracion, 'property_id' | 'kind'>;
        Update: Partial<BanderaDeModeracion>;
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
      /** Saldo de créditos. El libro mayor es de solo inserción. */
      saldo_de_creditos: { Args: { p_user: string }; Returns: number };
      /**
       * Abre un trabajo de Wasi AI: cupo, saldo e idempotencia.
       * Un pedido repetido devuelve el trabajo anterior, no uno nuevo.
       */
      iniciar_trabajo_ia: {
        Args: {
          p_kind: TipoTrabajoIA;
          p_operation: string;
          p_input: Json;
          p_idempotency_key: string;
          p_property_id?: string | null;
          p_costo?: number;
          p_limite_hora?: number;
        };
        Returns: TrabajoIA;
      };
      /** Cierra un trabajo con éxito y recién ahí descuenta los créditos. */
      terminar_trabajo_ia: {
        Args: {
          p_job_id: string;
          p_output: Json;
          p_provider: string;
          p_model: string;
          p_costo?: number;
          p_duration_ms?: number | null;
        };
        Returns: TrabajoIA;
      };
      /** Cierra un trabajo fallido. No cobra nada. */
      fallar_trabajo_ia: {
        Args: {
          p_job_id: string;
          p_error: string;
          p_provider?: string | null;
          p_duration_ms?: number | null;
        };
        Returns: TrabajoIA;
      };
      /** Confirmación de la persona: sin esto nada se aplica al aviso. */
      aceptar_trabajo_ia: { Args: { p_job_id: string }; Returns: TrabajoIA };
      /** Reabre un trabajo fallido. null cuando ya no quedan intentos. */
      reintentar_trabajo_ia: { Args: { p_job_id: string }; Returns: TrabajoIA | null };
      /**
       * Agrega la imagen editada como foto NUEVA del aviso.
       * Exige que el trabajo ya esté aceptado: sin confirmación no entra.
       */
      adjuntar_foto_editada: {
        Args: {
          p_job_id: string;
          p_original_media_id: string;
          p_url: string;
          p_storage_path: string;
          p_edit_kind: TipoEdicionMedio;
          p_width?: number | null;
          p_height?: number | null;
          p_bytes?: number | null;
        };
        Returns: MedioPropiedad;
      };
      /** Aparta créditos antes de un render largo. */
      reservar_creditos_ia: {
        Args: { p_job_id: string; p_creditos: number };
        Returns: TrabajoIA;
      };
      /** Devuelve lo apartado. Idempotente: no regala créditos. */
      devolver_creditos_ia: {
        Args: { p_job_id: string; p_motivo?: string };
        Returns: number;
      };
      /** Cierra bien un trabajo con reserva: la convierte en costo. */
      terminar_trabajo_reservado: {
        Args: {
          p_job_id: string;
          p_output: Json;
          p_provider: string;
          p_model: string;
          p_duration_ms?: number | null;
          p_provider_cost_micros?: number | null;
        };
        Returns: TrabajoIA;
      };
      /** Cuánto va del render. Solo sube. */
      avanzar_trabajo_ia: {
        Args: { p_job_id: string; p_progreso: number; p_provider_ref?: string | null };
        Returns: TrabajoIA;
      };
      /** Cancela y devuelve lo reservado entero. */
      cancelar_trabajo_ia: { Args: { p_job_id: string }; Returns: TrabajoIA };
      /** Listo + no vencido + administra el aviso. */
      puede_descargar_video: { Args: { p_video_id: string }; Returns: boolean };
      /** La ruta del archivo, solo si corresponde entregarla. */
      registrar_descarga_de_video: { Args: { p_video_id: string }; Returns: string | null };
      /** Cuántos avisos visibles hay por operación, tipo y distrito. */
      conteo_de_landings: {
        Args: Record<string, never>;
        Returns: {
          operation: Operacion;
          /** null = todos los tipos. */
          property_type: TipoInmueble | null;
          /** null = todo el país. */
          district: string | null;
          total: number;
        }[];
      };
      /** Aprueba, rechaza, pide cambios o pausa. Deja rastro siempre. */
      revisar_aviso: {
        Args: {
          p_property_id: string;
          p_decision: DecisionDeRevision;
          p_motivo?: string | null;
        };
        Returns: Propiedad;
      };
      /** Verificación de una inmobiliaria. La otorga Wasipe. */
      verificar_anunciante: {
        Args: {
          p_agency_id: string;
          p_estado: EstadoVerificacion;
          p_motivo?: string | null;
        };
        Returns: Agencia;
      };
      /** Cierra una bandera. Exige una nota. */
      resolver_bandera: {
        Args: { p_flag_id: number; p_estado: EstadoDeBandera; p_nota: string };
        Returns: BanderaDeModeracion;
      };
      /** Revisa un aviso y deja las banderas que correspondan. */
      marcar_aviso: { Args: { p_property_id: string }; Returns: number };
      /** Candidatos a duplicado. No decide nada: los ordena por parecido. */
      posibles_duplicados: {
        Args: { p_property_id: string; p_limite?: number };
        Returns: {
          id: string;
          code: string;
          title: string;
          similitud: number;
          misma_area: boolean;
        }[];
      };
      precio_sospechoso: { Args: { p_property_id: string }; Returns: boolean };
      es_personal: { Args: { p_role: PuestoDeWasipe }; Returns: boolean };
      es_personal_de_wasipe: { Args: Record<string, never>; Returns: boolean };
      /** Recalcula el índice de mercado entero. Devuelve cuántas filas quedaron. */
      recalcular_mercado: { Args: Record<string, never>; Returns: number };
      /**
       * Los avisos que sustentan la evaluación de precio de uno dado.
       * Sin poder mirarlos, la evaluación es un número que hay que creer.
       */
      comparables_de: {
        Args: { p_property_id: string; p_limite?: number };
        Returns: {
          id: string;
          code: string;
          title: string;
          district: string;
          price: number;
          currency: Moneda;
          total_area: number;
          price_usd_per_m2: number | null;
          bedrooms: number | null;
          published_at: string | null;
        }[];
      };
      /**
       * Comparación de hasta cuatro avisos publicados.
       * Los valores salen de la base sin intermediarios: es lo que hace
       * comprobable que la tabla comparativa no calcula nada por su cuenta.
       */
      comparar_avisos: {
        Args: { p_codigos: string[] };
        Returns: {
          id: string;
          code: string;
          title: string;
          district: string;
          province: string;
          operation: Operacion;
          property_type: TipoInmueble;
          currency: Moneda;
          price: number;
          price_usd: number | null;
          maintenance: number | null;
          total_area: number;
          built_area: number | null;
          price_per_m2: number | null;
          price_usd_per_m2: number | null;
          bedrooms: number | null;
          bathrooms: number | null;
          parking: number | null;
          age_years: number | null;
          furnished: Amoblado;
          pet_policy: PoliticaMascotas | null;
          verification_status: EstadoVerificacion;
          published_at: string | null;
          cover_url: string | null;
          features: string[];
          district_avg_usd_per_m2: number | null;
          district_listings: number | null;
        }[];
      };
      /** Marca vencidos los videos que pasaron su fecha. */
      vencer_videos: { Args: Record<string, never>; Returns: VideoDeAviso[] };
      /** Marca o bloquea una imagen editada. Solo moderación; nunca borra. */
      revisar_foto: {
        Args: {
          p_media_id: string;
          p_estado: EstadoRevisionMedio;
          p_motivo?: string | null;
        };
        Returns: MedioPropiedad;
      };
      descartar_trabajo_ia: { Args: { p_job_id: string }; Returns: TrabajoIA };
    };
    Enums: {
      user_role: RolUsuario;
      property_status: EstadoInmueble;
      listing_operation: Operacion;
      property_type: TipoInmueble;
      currency: Moneda;
      publication_status: EstadoPublicacion;
      verification_status: EstadoVerificacion;
      media_edit_kind: TipoEdicionMedio;
      media_review_status: EstadoRevisionMedio;
      market_period: PeriodoDeMercado;
      staff_role: PuestoDeWasipe;
      review_decision: DecisionDeRevision;
      flag_kind: TipoDeBandera;
      flag_status: EstadoDeBandera;
      video_format: FormatoDeVideo;
      video_template: PlantillaDeVideo;
      video_status: EstadoDeVideo;
    };
  };
};
