


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."apply_default_layout_overrides"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.layout_overrides is null then
    select layout_overrides into new.layout_overrides
    from public.factuur_layout_defaults
    where company_id = new.company_id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."apply_default_layout_overrides"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_factuur_nummer"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin return 'FAC-' || extract(year from now()) || '-' || lpad(nextval('factuur_seq')::text, 3, '0'); end;
$$;


ALTER FUNCTION "public"."next_factuur_nummer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_offerte_nummer"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin return 'OFF-' || lpad(nextval('offerte_seq')::text, 3, '0'); end;
$$;


ALTER FUNCTION "public"."next_offerte_nummer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_bijgewerkt"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


ALTER FUNCTION "public"."update_bijgewerkt"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."abonnementen" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "text" NOT NULL,
    "client_name" "text" NOT NULL,
    "client_contact_person" "text",
    "client_email" "text",
    "client_phone" "text",
    "client_address" "text",
    "description" "text" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "btw_percentage" numeric(5,2) DEFAULT 21 NOT NULL,
    "interval" "text" NOT NULL,
    "status" "text" DEFAULT 'actief'::"text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "next_invoice_date" "date",
    "last_invoice_date" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "abonnementen_interval_check" CHECK (("interval" = ANY (ARRAY['maandelijks'::"text", 'kwartaal'::"text", 'jaarlijks'::"text"]))),
    CONSTRAINT "abonnementen_status_check" CHECK (("status" = ANY (ARRAY['actief'::"text", 'gepauzeerd'::"text", 'beeindigd'::"text"])))
);


ALTER TABLE "public"."abonnementen" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."belasting_aangifte" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "jaar" integer NOT NULL,
    "urencriterium_voldaan" boolean DEFAULT false NOT NULL,
    "claim_zelfstandigenaftrek" boolean DEFAULT false NOT NULL,
    "claim_startersaftrek" boolean DEFAULT false NOT NULL,
    "startersaftrek_keer_gebruikt" integer DEFAULT 0 NOT NULL,
    "for_saldo_begin_jaar" numeric(12,2) DEFAULT 0 NOT NULL,
    "for_vrijval" numeric(12,2) DEFAULT 0 NOT NULL,
    "banksaldo_eindstand" numeric(12,2),
    "voorraad" numeric(12,2) DEFAULT 0 NOT NULL,
    "eigen_vermogen" numeric(12,2),
    "crediteuren" numeric(12,2) DEFAULT 0 NOT NULL,
    "notities" "text",
    "laatst_bijgewerkt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."belasting_aangifte" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."belasting_debiteur_status" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "aangifte_id" "uuid" NOT NULL,
    "factuur_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "notitie" "text",
    "oninbaar_per" "date",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."belasting_debiteur_status" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."belasting_investering" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "aangifte_id" "uuid" NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "bedrag" numeric(12,2) DEFAULT 0 NOT NULL,
    "datum" "date" NOT NULL,
    "afschrijvingstermijn_jaren" integer DEFAULT 5 NOT NULL,
    "notitie" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."belasting_investering" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."belasting_kosten_regel" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "aangifte_id" "uuid" NOT NULL,
    "label" "text" DEFAULT ''::"text" NOT NULL,
    "categorie" "text" DEFAULT 'overig'::"text" NOT NULL,
    "bedrag" numeric(12,2) DEFAULT 0 NOT NULL,
    "datum" "date",
    "notitie" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."belasting_kosten_regel" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."betalingen" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "factuur_id" "uuid",
    "company_id" "text" NOT NULL,
    "client_name" "text" NOT NULL,
    "client_email" "text",
    "amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'openstaand'::"text" NOT NULL,
    "method" "text",
    "mollie_payment_id" "text",
    "reference" "text",
    "paid_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."betalingen" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."btw_aangifte" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kwartaal" "text" NOT NULL,
    "jaar" integer NOT NULL,
    "kwartaalnummer" integer NOT NULL,
    "status" "text" DEFAULT 'concept'::"text" NOT NULL,
    "notities" "text",
    "ingediend_op" timestamp with time zone,
    "correctie_omzet_excl" numeric(12,2) DEFAULT 0 NOT NULL,
    "correctie_btw" numeric(12,2) DEFAULT 0 NOT NULL,
    "correctie_toelichting" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "grondslag" "text" DEFAULT 'kasstelsel'::"text" NOT NULL,
    CONSTRAINT "btw_aangifte_kwartaalnummer_check" CHECK ((("kwartaalnummer" >= 1) AND ("kwartaalnummer" <= 4)))
);


ALTER TABLE "public"."btw_aangifte" OWNER TO "postgres";


COMMENT ON COLUMN "public"."btw_aangifte"."grondslag" IS 'kasstelsel (omzet op ontvangst, bank leidend) of factuurstelsel (omzet op factuurdatum)';



CREATE TABLE IF NOT EXISTS "public"."btw_bank_transactie" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kwartaal" "text" NOT NULL,
    "referentie" "text",
    "datum" "date" NOT NULL,
    "bedrag" numeric(12,2) NOT NULL,
    "credit_debet" "text" NOT NULL,
    "tegenrekening" "text",
    "tegenrekeninghouder" "text",
    "omschrijving" "text",
    "betaalwijze" "text",
    "categorie" "text" DEFAULT 'onbekend'::"text" NOT NULL,
    "categorie_handmatig" boolean DEFAULT false NOT NULL,
    "factuur_id" "uuid",
    "factuur_nummer" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."btw_bank_transactie" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."btw_kostenpost" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kwartaal" "text" NOT NULL,
    "leverancier" "text" NOT NULL,
    "datum" "date",
    "bedrag_incl" numeric(12,2) DEFAULT 0 NOT NULL,
    "bedrag_excl" numeric(12,2) DEFAULT 0 NOT NULL,
    "btw_bedrag" numeric(12,2) DEFAULT 0 NOT NULL,
    "btw_behandeling" "text" DEFAULT 'nl_21'::"text" NOT NULL,
    "land" "text",
    "categorie" "text",
    "aftrekbaar_pct" numeric(5,2) DEFAULT 100 NOT NULL,
    "bron" "text",
    "bron_transactie_id" "uuid",
    "notitie" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."btw_kostenpost" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clickup_crm_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "clickup_task_id" "text" NOT NULL,
    "clickup_list_id" "text" NOT NULL,
    "clickup_space_id" "text",
    "clickup_folder_id" "text",
    "name" "text" NOT NULL,
    "status" "text",
    "url" "text",
    "archived" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "assignees" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "tags" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "custom_fields" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "raw" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "clickup_date_created" timestamp with time zone,
    "clickup_date_updated" timestamp with time zone,
    "due_date" timestamp with time zone,
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dash_tags" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "volgende_actie" "date",
    "volgende_actie_notitie" "text",
    "laatste_contact" timestamp with time zone,
    "contact_pogingen" integer DEFAULT 0 NOT NULL,
    "contact_status" "text" DEFAULT 'open'::"text" NOT NULL,
    "contact_status_tot" "date",
    "contact_status_reden" "text",
    "ai_status" "text",
    "ai_score" integer,
    "ai_prioriteit" "text",
    "ai_branche" "text",
    "ai_website" "text",
    "ai_samenvatting" "text",
    "ai_signalen" "jsonb",
    "ai_volgende_stap" "text",
    "ai_beoordeeld_op" timestamp with time zone,
    "ai_model" "text",
    "ai_fout" "text",
    "ruwe_contact_email" "text",
    "ruwe_website" "text",
    "ruwe_bron" "text",
    "ruwe_fit_reden" "text",
    "ruwe_prioriteit" "text",
    "ruwe_contactpersoon" "text",
    "ruwe_telefoon" "text",
    "ruwe_contact_status" "text",
    "ruwe_contact_gezocht_op" timestamp with time zone,
    "ruwe_contact_toelichting" "text",
    "ruwe_contact_fout" "text",
    "company_id" "text",
    CONSTRAINT "clickup_crm_records_contact_status_check" CHECK (("contact_status" = ANY (ARRAY['open'::"text", 'pauze'::"text", 'blokkade'::"text"]))),
    CONSTRAINT "clickup_crm_records_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['daley_list'::"text", 'lead'::"text", 'ruwe_lead'::"text", 'company'::"text", 'contact'::"text", 'assignment'::"text", 'clickup_invoice'::"text"]))),
    CONSTRAINT "clickup_crm_records_ruwe_prioriteit_check" CHECK ((("ruwe_prioriteit" IS NULL) OR ("ruwe_prioriteit" = ANY (ARRAY['ster'::"text", 'normaal'::"text", 'laag'::"text"]))))
);


ALTER TABLE "public"."clickup_crm_records" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clickup_crm_records"."volgende_actie" IS 'Datum waarop deze lead weer opgepakt moet worden. Standaardwaarde per fase, per lead aanpasbaar.';



COMMENT ON COLUMN "public"."clickup_crm_records"."laatste_contact" IS 'Laatste gelogde contactmoment (mail, telefoon, WhatsApp, meeting).';



COMMENT ON COLUMN "public"."clickup_crm_records"."contact_pogingen" IS 'Aantal gelogde contactmomenten, telt de follow-ups.';



COMMENT ON COLUMN "public"."clickup_crm_records"."contact_status" IS 'open, pauze (zacht, voorlopig niet) of blokkade (hard, nooit meer benaderen).';



COMMENT ON COLUMN "public"."clickup_crm_records"."contact_status_tot" IS 'Einddatum van een pauze. Daarna komt de relatie vanzelf weer terug in de opvolging.';



COMMENT ON COLUMN "public"."clickup_crm_records"."ai_status" IS 'wachtend, bezig, klaar of mislukt. NULL = nog nooit aangeboden.';



COMMENT ON COLUMN "public"."clickup_crm_records"."ai_score" IS 'Kwalificatiescore 0-100. Hoger is kansrijker voor Daley.';



COMMENT ON COLUMN "public"."clickup_crm_records"."ai_prioriteit" IS 'hoog, midden of laag. Grovere vertaling van de score.';



COMMENT ON COLUMN "public"."clickup_crm_records"."ai_branche" IS 'Branchelabel, bijvoorbeeld hovenier of tuinarchitect.';



COMMENT ON COLUMN "public"."clickup_crm_records"."ai_website" IS 'Website die de AI heeft gevonden en bekeken.';



COMMENT ON COLUMN "public"."clickup_crm_records"."ai_signalen" IS 'JSON: {plus: [..], min: [..]} met de argumenten achter de score.';



COMMENT ON COLUMN "public"."clickup_crm_records"."ai_volgende_stap" IS 'Voorgestelde eerste stap. Advies, wordt nooit automatisch uitgevoerd.';



COMMENT ON COLUMN "public"."clickup_crm_records"."ai_fout" IS 'Foutmelding van de laatste mislukte poging.';



COMMENT ON COLUMN "public"."clickup_crm_records"."ruwe_contact_email" IS 'Alleen relevant voor entity_type ruwe_lead: e-mailadres van de eerste ingang.';



COMMENT ON COLUMN "public"."clickup_crm_records"."ruwe_website" IS 'Alleen relevant voor entity_type ruwe_lead: website zoals gevonden tijdens onderzoek.';



COMMENT ON COLUMN "public"."clickup_crm_records"."ruwe_bron" IS 'Alleen relevant voor entity_type ruwe_lead: waar deze kandidaat vandaan komt (zoekopdracht, platform, verwijzing).';



COMMENT ON COLUMN "public"."clickup_crm_records"."ruwe_fit_reden" IS 'Alleen relevant voor entity_type ruwe_lead: handmatig genoteerde reden waarom dit een fit is, los van het AI-oordeel.';



COMMENT ON COLUMN "public"."clickup_crm_records"."ruwe_prioriteit" IS 'Alleen relevant voor entity_type ruwe_lead: ster, normaal of laag. Handmatige prioriteit, los van ai_prioriteit.';



COMMENT ON COLUMN "public"."clickup_crm_records"."ruwe_contactpersoon" IS 'Alleen relevant voor entity_type ruwe_lead: naam van de eigenaar of vaste contactpersoon.';



COMMENT ON COLUMN "public"."clickup_crm_records"."ruwe_telefoon" IS 'Alleen relevant voor entity_type ruwe_lead: telefoonnummer zoals het op de site staat.';



COMMENT ON COLUMN "public"."clickup_crm_records"."ruwe_contact_status" IS 'wachtend, bezig, klaar of mislukt. NULL = nog nooit opgezocht.';



COMMENT ON COLUMN "public"."clickup_crm_records"."ruwe_contact_gezocht_op" IS 'Wanneer de contactzoeker voor het laatst langs deze lead is geweest.';



COMMENT ON COLUMN "public"."clickup_crm_records"."ruwe_contact_toelichting" IS 'Waar de gegevens vandaan komen, bijvoorbeeld contactpagina of footer.';



COMMENT ON COLUMN "public"."clickup_crm_records"."ruwe_contact_fout" IS 'Foutmelding van de laatste mislukte poging.';



CREATE TABLE IF NOT EXISTS "public"."clickup_sync_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "status" "text" NOT NULL,
    "trigger_meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "counts" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_message" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    CONSTRAINT "clickup_sync_runs_source_check" CHECK (("source" = ANY (ARRAY['manual'::"text", 'cron'::"text", 'webhook'::"text"]))),
    CONSTRAINT "clickup_sync_runs_status_check" CHECK (("status" = ANY (ARRAY['started'::"text", 'success'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."clickup_sync_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clickup_sync_state" (
    "integration" "text" NOT NULL,
    "last_full_sync_at" timestamp with time zone,
    "last_successful_sync_at" timestamp with time zone,
    "last_webhook_at" timestamp with time zone,
    "last_error" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."clickup_sync_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clickup_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "headers" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed" boolean DEFAULT false NOT NULL,
    "processed_at" timestamp with time zone
);


ALTER TABLE "public"."clickup_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_activiteiten" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "record_id" "uuid" NOT NULL,
    "soort" "text" DEFAULT 'veld'::"text" NOT NULL,
    "omschrijving" "text" NOT NULL,
    "oude_waarde" "text",
    "nieuwe_waarde" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."crm_activiteiten" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_bedrijven" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clickup_id" "text",
    "naam" "text" NOT NULL,
    "status" "text",
    "website" "text",
    "klantnummer" "text",
    "notities" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tags" "text"[],
    "clickup_created_at" timestamp with time zone,
    "clickup_updated_at" timestamp with time zone
);


ALTER TABLE "public"."crm_bedrijven" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_contacten" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clickup_id" "text",
    "naam" "text" NOT NULL,
    "email" "text",
    "telefoon" "text",
    "beroep" "text",
    "website" "text",
    "bedrijf_id" "uuid",
    "notities" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tags" "text"[],
    "clickup_created_at" timestamp with time zone,
    "clickup_updated_at" timestamp with time zone
);


ALTER TABLE "public"."crm_contacten" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_dash_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "naam" "text" NOT NULL,
    "kleur" "text" DEFAULT 'gray'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."crm_dash_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_facturatie" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clickup_id" "text",
    "naam" "text" NOT NULL,
    "status" "text",
    "bedrijf_id" "uuid",
    "contactpersoon_id" "uuid",
    "bron" "text",
    "type_kans" "text",
    "invoice_category" "text",
    "producten" "text"[],
    "details" "text",
    "prijs_incl_btw" numeric,
    "factuurdatum" "date",
    "op_initiatief_van" "text",
    "notities" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."crm_facturatie" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_field_options" (
    "id" "text" NOT NULL,
    "field_id" "text" NOT NULL,
    "entity_type" "text",
    "field_name" "text",
    "field_type" "text" NOT NULL,
    "label" "text" NOT NULL,
    "color" "text",
    "orderindex" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."crm_field_options" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clickup_id" "text",
    "naam" "text" NOT NULL,
    "status" "text",
    "bedrijf_id" "uuid",
    "contactpersoon_id" "uuid",
    "bron" "text",
    "type_kans" "text",
    "producten" "text"[],
    "details" "text",
    "prijs_incl_btw" numeric,
    "beslissingsdatum" "date",
    "op_initiatief_van" "text",
    "reden" "text",
    "notities" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "tags" "text"[],
    "clickup_created_at" timestamp with time zone,
    "clickup_updated_at" timestamp with time zone
);


ALTER TABLE "public"."crm_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."crm_opdrachten" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "clickup_id" "text",
    "naam" "text" NOT NULL,
    "status" "text",
    "bedrijf_id" "uuid",
    "contactpersoon_id" "uuid",
    "details" "text",
    "prijs_incl_btw" numeric,
    "datum_afgerond" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "notities" "text"
);


ALTER TABLE "public"."crm_opdrachten" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."facturen" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "text" NOT NULL,
    "number" "text" NOT NULL,
    "client_name" "text" NOT NULL,
    "client_email" "text",
    "subtotal" numeric(10,2) DEFAULT 0,
    "btw_amount" numeric(10,2) DEFAULT 0,
    "total" numeric(10,2) DEFAULT 0,
    "status" "text" DEFAULT 'open'::"text",
    "due_date" "date",
    "paid_at" timestamp with time zone,
    "offerte_id" "uuid",
    "mollie_payment_id" "text",
    "mollie_payment_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "date" "date" NOT NULL,
    "client_contact_person" "text",
    "client_phone" "text",
    "client_address" "text",
    "client_kvk" "text",
    "client_btw" "text",
    "btw_percentage" numeric(5,2) DEFAULT 21 NOT NULL,
    "slug" "text",
    "exclude_from_revenue" boolean DEFAULT false,
    "revenue_date" "date",
    "layout_overrides" "jsonb",
    "client_name_bestand" "text",
    CONSTRAINT "facturen_status_check" CHECK (("status" = ANY (ARRAY['concept'::"text", 'verzonden'::"text", 'herinnering-verzonden'::"text", 'betaald'::"text", 'te-laat'::"text", 'geannuleerd'::"text"])))
);


ALTER TABLE "public"."facturen" OWNER TO "postgres";


COMMENT ON COLUMN "public"."facturen"."client_name_bestand" IS 'Optionele korte/schone naam voor bestandsnamen (PDF/HTML), los van client_name dat op de factuur zelf staat. Valt terug op client_name als leeg.';



CREATE TABLE IF NOT EXISTS "public"."facturen_prullenbak" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "factuur_id" "uuid" NOT NULL,
    "number" "text" NOT NULL,
    "company_id" "text",
    "client_name" "text",
    "status" "text",
    "date" "date",
    "total" numeric(10,2),
    "bron" "text",
    "reden" "text",
    "verwijderd_op" timestamp with time zone DEFAULT "now"() NOT NULL,
    "factuur" "jsonb" NOT NULL,
    "regels" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."facturen_prullenbak" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."factuur_layout_defaults" (
    "company_id" "text" NOT NULL,
    "layout_overrides" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."factuur_layout_defaults" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."factuur_line_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "factuur_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "description" "text" NOT NULL,
    "details" "text",
    "quantity" numeric(10,2) DEFAULT 1 NOT NULL,
    "unit_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "section_title" "text",
    "datum" "date",
    "eenheid" "text"
);


ALTER TABLE "public"."factuur_line_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."factuur_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."factuur_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."instellingen" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "bedrijfsnaam" "text",
    "email" "text",
    "telefoon" "text",
    "adres" "text",
    "postcode" "text",
    "plaats" "text",
    "kvk" "text",
    "btw_nummer" "text",
    "iban" "text",
    "logo_url" "text",
    "mollie_api_key" "text",
    "clickup_token" "text",
    "aangemaakt" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."instellingen" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."klanten" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "naam" "text" NOT NULL,
    "bedrijf" "text",
    "email" "text",
    "telefoon" "text",
    "adres" "text",
    "postcode" "text",
    "plaats" "text",
    "kvk" "text",
    "btw_nummer" "text",
    "notities" "text",
    "aangemaakt" timestamp with time zone DEFAULT "now"(),
    "bijgewerkt" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."klanten" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."line_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "offerte_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "description" "text" NOT NULL,
    "details" "text",
    "quantity" numeric(10,2) DEFAULT 1 NOT NULL,
    "unit_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "section_title" "text"
);


ALTER TABLE "public"."line_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."offerte_approvals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "offerte_id" "uuid" NOT NULL,
    "client_name" "text" NOT NULL,
    "client_email" "text" NOT NULL,
    "client_ip" "text",
    "user_agent" "text",
    "agreed_to_terms" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."offerte_approvals" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."offerte_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."offerte_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."offertes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "number" "text" NOT NULL,
    "company_id" "text" NOT NULL,
    "client_name" "text" NOT NULL,
    "client_contact_person" "text",
    "client_email" "text",
    "client_phone" "text",
    "client_address" "text",
    "client_kvk" "text",
    "client_btw" "text",
    "date" "date" NOT NULL,
    "valid_until" "date" NOT NULL,
    "status" "text" DEFAULT 'concept'::"text" NOT NULL,
    "subtotal" numeric(10,2) DEFAULT 0 NOT NULL,
    "btw_percentage" numeric(5,2) DEFAULT 21 NOT NULL,
    "btw_amount" numeric(10,2) DEFAULT 0 NOT NULL,
    "total" numeric(10,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "slug" "text",
    "password_hash" "text",
    "is_public" boolean DEFAULT false NOT NULL,
    "approved_at" timestamp with time zone,
    "approved_by_name" "text",
    "approved_by_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "intro_text" "text",
    "terms_text" "text",
    "payment_url" "text",
    "deposit_paid_at" "date",
    "rejection_reason" "text",
    "rejection_notes" "text",
    "status_changed_at" timestamp with time zone,
    "deposit_percentage" numeric DEFAULT 50
);


ALTER TABLE "public"."offertes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."taken" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "done" boolean DEFAULT false NOT NULL,
    "scheduled_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."taken" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."uren" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "text" NOT NULL,
    "datum" "date" NOT NULL,
    "klant" "text" NOT NULL,
    "project" "text",
    "uren" numeric(5,2) NOT NULL,
    "omschrijving" "text",
    "uurtarief" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "gefactureerd" boolean DEFAULT false,
    "factuurnummer" "text"
);


ALTER TABLE "public"."uren" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."uren_klanten" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "naam" "text" NOT NULL,
    "standaard_uurtarief" numeric(10,2) DEFAULT 0 NOT NULL,
    "company_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "contactpersoon" "text",
    "adres" "text",
    "postcode" "text",
    "stad" "text",
    "klantnummer" "text",
    "email" "text",
    "crm_bedrijf_id" "uuid"
);


ALTER TABLE "public"."uren_klanten" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."uren_projecten" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "text" NOT NULL,
    "klant" "text" NOT NULL,
    "naam" "text" NOT NULL,
    "bedrag" numeric(10,2) DEFAULT 0 NOT NULL,
    "datum" "date" NOT NULL,
    "omschrijving" "text",
    "status" "text" DEFAULT 'actief'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "aantal" numeric(10,2),
    "prijs" numeric(10,2)
);


ALTER TABLE "public"."uren_projecten" OWNER TO "postgres";


COMMENT ON COLUMN "public"."uren_projecten"."aantal" IS 'Aantal eenheden; leeg betekent 1';



COMMENT ON COLUMN "public"."uren_projecten"."prijs" IS 'Prijs per eenheid ex btw; leeg betekent gelijk aan bedrag';



CREATE TABLE IF NOT EXISTS "public"."werkbank_secties" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "titel" "text" NOT NULL,
    "inhoud" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'notities'::"text" NOT NULL,
    "gecontroleerd_op" "date",
    "volgorde" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bijgewerkt_op" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "werkbank_secties_status_check" CHECK (("status" = ANY (ARRAY['nagekeken'::"text", 'notities'::"text", 'openstaand'::"text"])))
);


ALTER TABLE "public"."werkbank_secties" OWNER TO "postgres";


ALTER TABLE ONLY "public"."abonnementen"
    ADD CONSTRAINT "abonnementen_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."belasting_aangifte"
    ADD CONSTRAINT "belasting_aangifte_jaar_key" UNIQUE ("jaar");



ALTER TABLE ONLY "public"."belasting_aangifte"
    ADD CONSTRAINT "belasting_aangifte_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."belasting_debiteur_status"
    ADD CONSTRAINT "belasting_debiteur_status_factuur_id_aangifte_id_key" UNIQUE ("factuur_id", "aangifte_id");



ALTER TABLE ONLY "public"."belasting_debiteur_status"
    ADD CONSTRAINT "belasting_debiteur_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."belasting_investering"
    ADD CONSTRAINT "belasting_investering_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."belasting_kosten_regel"
    ADD CONSTRAINT "belasting_kosten_regel_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."betalingen"
    ADD CONSTRAINT "betalingen_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."btw_aangifte"
    ADD CONSTRAINT "btw_aangifte_kwartaal_key" UNIQUE ("kwartaal");



ALTER TABLE ONLY "public"."btw_aangifte"
    ADD CONSTRAINT "btw_aangifte_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."btw_bank_transactie"
    ADD CONSTRAINT "btw_bank_transactie_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."btw_bank_transactie"
    ADD CONSTRAINT "btw_bank_transactie_referentie_key" UNIQUE ("referentie");



ALTER TABLE ONLY "public"."btw_kostenpost"
    ADD CONSTRAINT "btw_kostenpost_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clickup_crm_records"
    ADD CONSTRAINT "clickup_crm_records_clickup_task_id_key" UNIQUE ("clickup_task_id");



ALTER TABLE ONLY "public"."clickup_crm_records"
    ADD CONSTRAINT "clickup_crm_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clickup_sync_runs"
    ADD CONSTRAINT "clickup_sync_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clickup_sync_state"
    ADD CONSTRAINT "clickup_sync_state_pkey" PRIMARY KEY ("integration");



ALTER TABLE ONLY "public"."clickup_webhook_events"
    ADD CONSTRAINT "clickup_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_activiteiten"
    ADD CONSTRAINT "crm_activiteiten_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_bedrijven"
    ADD CONSTRAINT "crm_bedrijven_clickup_id_key" UNIQUE ("clickup_id");



ALTER TABLE ONLY "public"."crm_bedrijven"
    ADD CONSTRAINT "crm_bedrijven_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_contacten"
    ADD CONSTRAINT "crm_contacten_clickup_id_key" UNIQUE ("clickup_id");



ALTER TABLE ONLY "public"."crm_contacten"
    ADD CONSTRAINT "crm_contacten_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_dash_tags"
    ADD CONSTRAINT "crm_dash_tags_naam_key" UNIQUE ("naam");



ALTER TABLE ONLY "public"."crm_dash_tags"
    ADD CONSTRAINT "crm_dash_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_facturatie"
    ADD CONSTRAINT "crm_facturatie_clickup_id_key" UNIQUE ("clickup_id");



ALTER TABLE ONLY "public"."crm_facturatie"
    ADD CONSTRAINT "crm_facturatie_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_field_options"
    ADD CONSTRAINT "crm_field_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_clickup_id_key" UNIQUE ("clickup_id");



ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."crm_opdrachten"
    ADD CONSTRAINT "crm_opdrachten_clickup_id_key" UNIQUE ("clickup_id");



ALTER TABLE ONLY "public"."crm_opdrachten"
    ADD CONSTRAINT "crm_opdrachten_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."facturen"
    ADD CONSTRAINT "facturen_number_key" UNIQUE ("number");



ALTER TABLE ONLY "public"."facturen"
    ADD CONSTRAINT "facturen_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."facturen_prullenbak"
    ADD CONSTRAINT "facturen_prullenbak_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."facturen"
    ADD CONSTRAINT "facturen_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."factuur_layout_defaults"
    ADD CONSTRAINT "factuur_layout_defaults_pkey" PRIMARY KEY ("company_id");



ALTER TABLE ONLY "public"."factuur_line_items"
    ADD CONSTRAINT "factuur_line_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instellingen"
    ADD CONSTRAINT "instellingen_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instellingen"
    ADD CONSTRAINT "instellingen_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."klanten"
    ADD CONSTRAINT "klanten_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."line_items"
    ADD CONSTRAINT "line_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offerte_approvals"
    ADD CONSTRAINT "offerte_approvals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offertes"
    ADD CONSTRAINT "offertes_number_key" UNIQUE ("number");



ALTER TABLE ONLY "public"."offertes"
    ADD CONSTRAINT "offertes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."offertes"
    ADD CONSTRAINT "offertes_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."taken"
    ADD CONSTRAINT "taken_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."uren_klanten"
    ADD CONSTRAINT "uren_klanten_naam_key" UNIQUE ("naam");



ALTER TABLE ONLY "public"."uren_klanten"
    ADD CONSTRAINT "uren_klanten_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."uren"
    ADD CONSTRAINT "uren_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."uren_projecten"
    ADD CONSTRAINT "uren_projecten_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."werkbank_secties"
    ADD CONSTRAINT "werkbank_secties_pkey" PRIMARY KEY ("id");



CREATE INDEX "belasting_debiteur_status_aangifte_idx" ON "public"."belasting_debiteur_status" USING "btree" ("aangifte_id");



CREATE INDEX "belasting_investering_aangifte_idx" ON "public"."belasting_investering" USING "btree" ("aangifte_id");



CREATE INDEX "belasting_kosten_regel_aangifte_idx" ON "public"."belasting_kosten_regel" USING "btree" ("aangifte_id");



CREATE INDEX "betalingen_factuur_id_idx" ON "public"."betalingen" USING "btree" ("factuur_id");



CREATE INDEX "betalingen_status_idx" ON "public"."betalingen" USING "btree" ("status");



CREATE INDEX "clickup_crm_records_ai_status_idx" ON "public"."clickup_crm_records" USING "btree" ("entity_type", "ai_status") WHERE ("entity_type" = 'lead'::"text");



CREATE INDEX "clickup_crm_records_ruwe_contact_status_idx" ON "public"."clickup_crm_records" USING "btree" ("ruwe_contact_status") WHERE ("entity_type" = 'ruwe_lead'::"text");



CREATE INDEX "clickup_crm_records_ruwe_lead_status_idx" ON "public"."clickup_crm_records" USING "btree" ("status") WHERE ("entity_type" = 'ruwe_lead'::"text");



CREATE INDEX "clickup_crm_records_volgende_actie_idx" ON "public"."clickup_crm_records" USING "btree" ("volgende_actie") WHERE (("volgende_actie" IS NOT NULL) AND ("contact_status" <> 'blokkade'::"text"));



CREATE INDEX "crm_activiteiten_record_idx" ON "public"."crm_activiteiten" USING "btree" ("record_id", "created_at" DESC);



CREATE INDEX "crm_field_options_field_id_idx" ON "public"."crm_field_options" USING "btree" ("field_id");



CREATE INDEX "facturen_prullenbak_number_idx" ON "public"."facturen_prullenbak" USING "btree" ("number");



CREATE INDEX "facturen_prullenbak_verwijderd_op_idx" ON "public"."facturen_prullenbak" USING "btree" ("verwijderd_op" DESC);



CREATE INDEX "idx_abonnementen_company_id" ON "public"."abonnementen" USING "btree" ("company_id");



CREATE INDEX "idx_abonnementen_status" ON "public"."abonnementen" USING "btree" ("status");



CREATE INDEX "idx_btw_bank_kwartaal" ON "public"."btw_bank_transactie" USING "btree" ("kwartaal");



CREATE INDEX "idx_btw_kosten_kwartaal" ON "public"."btw_kostenpost" USING "btree" ("kwartaal");



CREATE INDEX "idx_clickup_crm_active" ON "public"."clickup_crm_records" USING "btree" ("active");



CREATE INDEX "idx_clickup_crm_clickup_list_id" ON "public"."clickup_crm_records" USING "btree" ("clickup_list_id");



CREATE INDEX "idx_clickup_crm_entity_type" ON "public"."clickup_crm_records" USING "btree" ("entity_type");



CREATE INDEX "idx_clickup_sync_runs_started_at" ON "public"."clickup_sync_runs" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_clickup_webhook_events_received_at" ON "public"."clickup_webhook_events" USING "btree" ("received_at" DESC);



CREATE INDEX "idx_crm_records_company_entity" ON "public"."clickup_crm_records" USING "btree" ("company_id", "entity_type");



CREATE INDEX "idx_factuur_line_items_factuur_id" ON "public"."factuur_line_items" USING "btree" ("factuur_id");



CREATE INDEX "idx_line_items_offerte_id" ON "public"."line_items" USING "btree" ("offerte_id");



CREATE INDEX "idx_offerte_approvals_offerte_id" ON "public"."offerte_approvals" USING "btree" ("offerte_id");



CREATE INDEX "idx_offertes_company_id" ON "public"."offertes" USING "btree" ("company_id");



CREATE INDEX "idx_offertes_created_at" ON "public"."offertes" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_offertes_slug" ON "public"."offertes" USING "btree" ("slug");



CREATE INDEX "idx_offertes_status" ON "public"."offertes" USING "btree" ("status");



CREATE INDEX "idx_uren_datum" ON "public"."uren" USING "btree" ("datum" DESC);



CREATE INDEX "idx_uren_klant" ON "public"."uren" USING "btree" ("klant");



CREATE OR REPLACE TRIGGER "facturen_bijgewerkt" BEFORE UPDATE ON "public"."facturen" FOR EACH ROW EXECUTE FUNCTION "public"."update_bijgewerkt"();



CREATE OR REPLACE TRIGGER "klanten_bijgewerkt" BEFORE UPDATE ON "public"."klanten" FOR EACH ROW EXECUTE FUNCTION "public"."update_bijgewerkt"();



CREATE OR REPLACE TRIGGER "trg_apply_default_layout_overrides" BEFORE INSERT ON "public"."facturen" FOR EACH ROW EXECUTE FUNCTION "public"."apply_default_layout_overrides"();



ALTER TABLE ONLY "public"."belasting_debiteur_status"
    ADD CONSTRAINT "belasting_debiteur_status_aangifte_id_fkey" FOREIGN KEY ("aangifte_id") REFERENCES "public"."belasting_aangifte"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."belasting_debiteur_status"
    ADD CONSTRAINT "belasting_debiteur_status_factuur_id_fkey" FOREIGN KEY ("factuur_id") REFERENCES "public"."facturen"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."belasting_investering"
    ADD CONSTRAINT "belasting_investering_aangifte_id_fkey" FOREIGN KEY ("aangifte_id") REFERENCES "public"."belasting_aangifte"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."belasting_kosten_regel"
    ADD CONSTRAINT "belasting_kosten_regel_aangifte_id_fkey" FOREIGN KEY ("aangifte_id") REFERENCES "public"."belasting_aangifte"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."betalingen"
    ADD CONSTRAINT "betalingen_factuur_id_fkey" FOREIGN KEY ("factuur_id") REFERENCES "public"."facturen"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."btw_bank_transactie"
    ADD CONSTRAINT "btw_bank_transactie_factuur_id_fkey" FOREIGN KEY ("factuur_id") REFERENCES "public"."facturen"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."btw_kostenpost"
    ADD CONSTRAINT "btw_kostenpost_bron_transactie_id_fkey" FOREIGN KEY ("bron_transactie_id") REFERENCES "public"."btw_bank_transactie"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_activiteiten"
    ADD CONSTRAINT "crm_activiteiten_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "public"."clickup_crm_records"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."crm_contacten"
    ADD CONSTRAINT "crm_contacten_bedrijf_id_fkey" FOREIGN KEY ("bedrijf_id") REFERENCES "public"."crm_bedrijven"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_facturatie"
    ADD CONSTRAINT "crm_facturatie_bedrijf_id_fkey" FOREIGN KEY ("bedrijf_id") REFERENCES "public"."crm_bedrijven"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_facturatie"
    ADD CONSTRAINT "crm_facturatie_contactpersoon_id_fkey" FOREIGN KEY ("contactpersoon_id") REFERENCES "public"."crm_contacten"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_bedrijf_id_fkey" FOREIGN KEY ("bedrijf_id") REFERENCES "public"."crm_bedrijven"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_leads"
    ADD CONSTRAINT "crm_leads_contactpersoon_id_fkey" FOREIGN KEY ("contactpersoon_id") REFERENCES "public"."crm_contacten"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_opdrachten"
    ADD CONSTRAINT "crm_opdrachten_bedrijf_id_fkey" FOREIGN KEY ("bedrijf_id") REFERENCES "public"."crm_bedrijven"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."crm_opdrachten"
    ADD CONSTRAINT "crm_opdrachten_contactpersoon_id_fkey" FOREIGN KEY ("contactpersoon_id") REFERENCES "public"."crm_contacten"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."factuur_line_items"
    ADD CONSTRAINT "factuur_line_items_factuur_id_fkey" FOREIGN KEY ("factuur_id") REFERENCES "public"."facturen"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."instellingen"
    ADD CONSTRAINT "instellingen_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."klanten"
    ADD CONSTRAINT "klanten_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."line_items"
    ADD CONSTRAINT "line_items_offerte_id_fkey" FOREIGN KEY ("offerte_id") REFERENCES "public"."offertes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."offerte_approvals"
    ADD CONSTRAINT "offerte_approvals_offerte_id_fkey" FOREIGN KEY ("offerte_id") REFERENCES "public"."offertes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."uren_klanten"
    ADD CONSTRAINT "uren_klanten_crm_bedrijf_id_fkey" FOREIGN KEY ("crm_bedrijf_id") REFERENCES "public"."crm_bedrijven"("id") ON DELETE SET NULL;



ALTER TABLE "public"."abonnementen" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."belasting_aangifte" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."belasting_debiteur_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."belasting_investering" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."belasting_kosten_regel" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."betalingen" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."btw_aangifte" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."btw_bank_transactie" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."btw_kostenpost" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clickup_crm_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clickup_sync_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clickup_sync_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clickup_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_activiteiten" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_bedrijven" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_contacten" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_dash_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_facturatie" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_field_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."crm_opdrachten" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."facturen" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."facturen_prullenbak" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."factuur_layout_defaults" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."factuur_line_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."instellingen" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."klanten" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."line_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."offerte_approvals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."offertes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."taken" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."uren" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."uren_klanten" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."uren_projecten" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."werkbank_secties" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_default_layout_overrides"() TO "anon";
GRANT ALL ON FUNCTION "public"."apply_default_layout_overrides"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_default_layout_overrides"() TO "service_role";



GRANT ALL ON FUNCTION "public"."next_factuur_nummer"() TO "anon";
GRANT ALL ON FUNCTION "public"."next_factuur_nummer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_factuur_nummer"() TO "service_role";



GRANT ALL ON FUNCTION "public"."next_offerte_nummer"() TO "anon";
GRANT ALL ON FUNCTION "public"."next_offerte_nummer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_offerte_nummer"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_bijgewerkt"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_bijgewerkt"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_bijgewerkt"() TO "service_role";



GRANT ALL ON TABLE "public"."abonnementen" TO "anon";
GRANT ALL ON TABLE "public"."abonnementen" TO "authenticated";
GRANT ALL ON TABLE "public"."abonnementen" TO "service_role";



GRANT ALL ON TABLE "public"."belasting_aangifte" TO "anon";
GRANT ALL ON TABLE "public"."belasting_aangifte" TO "authenticated";
GRANT ALL ON TABLE "public"."belasting_aangifte" TO "service_role";



GRANT ALL ON TABLE "public"."belasting_debiteur_status" TO "anon";
GRANT ALL ON TABLE "public"."belasting_debiteur_status" TO "authenticated";
GRANT ALL ON TABLE "public"."belasting_debiteur_status" TO "service_role";



GRANT ALL ON TABLE "public"."belasting_investering" TO "anon";
GRANT ALL ON TABLE "public"."belasting_investering" TO "authenticated";
GRANT ALL ON TABLE "public"."belasting_investering" TO "service_role";



GRANT ALL ON TABLE "public"."belasting_kosten_regel" TO "anon";
GRANT ALL ON TABLE "public"."belasting_kosten_regel" TO "authenticated";
GRANT ALL ON TABLE "public"."belasting_kosten_regel" TO "service_role";



GRANT ALL ON TABLE "public"."betalingen" TO "anon";
GRANT ALL ON TABLE "public"."betalingen" TO "authenticated";
GRANT ALL ON TABLE "public"."betalingen" TO "service_role";



GRANT ALL ON TABLE "public"."btw_aangifte" TO "anon";
GRANT ALL ON TABLE "public"."btw_aangifte" TO "authenticated";
GRANT ALL ON TABLE "public"."btw_aangifte" TO "service_role";



GRANT ALL ON TABLE "public"."btw_bank_transactie" TO "anon";
GRANT ALL ON TABLE "public"."btw_bank_transactie" TO "authenticated";
GRANT ALL ON TABLE "public"."btw_bank_transactie" TO "service_role";



GRANT ALL ON TABLE "public"."btw_kostenpost" TO "anon";
GRANT ALL ON TABLE "public"."btw_kostenpost" TO "authenticated";
GRANT ALL ON TABLE "public"."btw_kostenpost" TO "service_role";



GRANT ALL ON TABLE "public"."clickup_crm_records" TO "anon";
GRANT ALL ON TABLE "public"."clickup_crm_records" TO "authenticated";
GRANT ALL ON TABLE "public"."clickup_crm_records" TO "service_role";



GRANT ALL ON TABLE "public"."clickup_sync_runs" TO "anon";
GRANT ALL ON TABLE "public"."clickup_sync_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."clickup_sync_runs" TO "service_role";



GRANT ALL ON TABLE "public"."clickup_sync_state" TO "anon";
GRANT ALL ON TABLE "public"."clickup_sync_state" TO "authenticated";
GRANT ALL ON TABLE "public"."clickup_sync_state" TO "service_role";



GRANT ALL ON TABLE "public"."clickup_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."clickup_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."clickup_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."crm_activiteiten" TO "anon";
GRANT ALL ON TABLE "public"."crm_activiteiten" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_activiteiten" TO "service_role";



GRANT ALL ON TABLE "public"."crm_bedrijven" TO "anon";
GRANT ALL ON TABLE "public"."crm_bedrijven" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_bedrijven" TO "service_role";



GRANT ALL ON TABLE "public"."crm_contacten" TO "anon";
GRANT ALL ON TABLE "public"."crm_contacten" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_contacten" TO "service_role";



GRANT ALL ON TABLE "public"."crm_dash_tags" TO "anon";
GRANT ALL ON TABLE "public"."crm_dash_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_dash_tags" TO "service_role";



GRANT ALL ON TABLE "public"."crm_facturatie" TO "anon";
GRANT ALL ON TABLE "public"."crm_facturatie" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_facturatie" TO "service_role";



GRANT ALL ON TABLE "public"."crm_field_options" TO "anon";
GRANT ALL ON TABLE "public"."crm_field_options" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_field_options" TO "service_role";



GRANT ALL ON TABLE "public"."crm_leads" TO "anon";
GRANT ALL ON TABLE "public"."crm_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_leads" TO "service_role";



GRANT ALL ON TABLE "public"."crm_opdrachten" TO "anon";
GRANT ALL ON TABLE "public"."crm_opdrachten" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_opdrachten" TO "service_role";



GRANT ALL ON TABLE "public"."facturen" TO "anon";
GRANT ALL ON TABLE "public"."facturen" TO "authenticated";
GRANT ALL ON TABLE "public"."facturen" TO "service_role";



GRANT ALL ON TABLE "public"."facturen_prullenbak" TO "anon";
GRANT ALL ON TABLE "public"."facturen_prullenbak" TO "authenticated";
GRANT ALL ON TABLE "public"."facturen_prullenbak" TO "service_role";



GRANT ALL ON TABLE "public"."factuur_layout_defaults" TO "anon";
GRANT ALL ON TABLE "public"."factuur_layout_defaults" TO "authenticated";
GRANT ALL ON TABLE "public"."factuur_layout_defaults" TO "service_role";



GRANT ALL ON TABLE "public"."factuur_line_items" TO "anon";
GRANT ALL ON TABLE "public"."factuur_line_items" TO "authenticated";
GRANT ALL ON TABLE "public"."factuur_line_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."factuur_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."factuur_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."factuur_seq" TO "service_role";



GRANT ALL ON TABLE "public"."instellingen" TO "anon";
GRANT ALL ON TABLE "public"."instellingen" TO "authenticated";
GRANT ALL ON TABLE "public"."instellingen" TO "service_role";



GRANT ALL ON TABLE "public"."klanten" TO "anon";
GRANT ALL ON TABLE "public"."klanten" TO "authenticated";
GRANT ALL ON TABLE "public"."klanten" TO "service_role";



GRANT ALL ON TABLE "public"."line_items" TO "anon";
GRANT ALL ON TABLE "public"."line_items" TO "authenticated";
GRANT ALL ON TABLE "public"."line_items" TO "service_role";



GRANT ALL ON TABLE "public"."offerte_approvals" TO "anon";
GRANT ALL ON TABLE "public"."offerte_approvals" TO "authenticated";
GRANT ALL ON TABLE "public"."offerte_approvals" TO "service_role";



GRANT ALL ON SEQUENCE "public"."offerte_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."offerte_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."offerte_seq" TO "service_role";



GRANT ALL ON TABLE "public"."offertes" TO "anon";
GRANT ALL ON TABLE "public"."offertes" TO "authenticated";
GRANT ALL ON TABLE "public"."offertes" TO "service_role";



GRANT ALL ON TABLE "public"."taken" TO "anon";
GRANT ALL ON TABLE "public"."taken" TO "authenticated";
GRANT ALL ON TABLE "public"."taken" TO "service_role";



GRANT ALL ON TABLE "public"."uren" TO "anon";
GRANT ALL ON TABLE "public"."uren" TO "authenticated";
GRANT ALL ON TABLE "public"."uren" TO "service_role";



GRANT ALL ON TABLE "public"."uren_klanten" TO "anon";
GRANT ALL ON TABLE "public"."uren_klanten" TO "authenticated";
GRANT ALL ON TABLE "public"."uren_klanten" TO "service_role";



GRANT ALL ON TABLE "public"."uren_projecten" TO "anon";
GRANT ALL ON TABLE "public"."uren_projecten" TO "authenticated";
GRANT ALL ON TABLE "public"."uren_projecten" TO "service_role";



GRANT ALL ON TABLE "public"."werkbank_secties" TO "anon";
GRANT ALL ON TABLE "public"."werkbank_secties" TO "authenticated";
GRANT ALL ON TABLE "public"."werkbank_secties" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







