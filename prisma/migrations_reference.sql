-- VELMORA LABS — Référence SQL du modèle de données (cahier des charges §13)
-- Ce projet tourne en développement sur SQLite via Prisma (db/custom.db).
-- Cette référence documente l'équivalent PostgreSQL versionné pour la production.
-- Générer les migrations officielles avec : bunx prisma migrate dev --name init

-- Statuts contrôlés côté application (CHECK au niveau PostgreSQL recommandé) :
-- profiles.role            : owner | catalog_manager | marketing_editor | crm_manager | analyst
-- products.status          : draft | pending_review | published | suspended | archived
-- product_offers.availability : in_stock | out_of_stock | unknown
-- conversion.status        : estimated | pending | confirmed | cancelled | paid | unknown
-- crm_contacts.status      : new | to_contact | in_discussion | qualified | converted | lost | unsubscribed
-- crm_contacts.consent_status : granted | none | withdrawn
-- ai_assets.status         : draft | pending_review | approved | rejected | archived
-- social_posts.publish_status : draft | approved | scheduled | published_manual | failed | archived

-- Contraintes d'intégrité clés (cahier des charges §13) :
-- 1. Déduplication conversions :
--    ALTER TABLE conversions ADD CONSTRAINT uq_conv_partner_ext UNIQUE (partner_id, external_conversion_id);
-- 2. Offres externes uniques par partenaire :
--    ALTER TABLE product_offers ADD CONSTRAINT uq_offer_partner_ext UNIQUE (partner_id, external_id);
-- 3. Slug produit unique : products.slug UNIQUE
-- 4. Montants non négatifs :
--    ALTER TABLE products ADD CONSTRAINT chk_price CHECK (price_min_cents IS NULL OR price_min_cents >= 0);
-- 5. Journal d'audit append-only :
--    REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;
-- 6. Suppression/anonymisation CRM : champ anonymized_at + effacement email/phone (implémenté).

-- Index sur les filtres fréquents :
-- CREATE INDEX idx_click_events_clicked_at ON click_events (clicked_at);
-- CREATE INDEX idx_click_events_offer ON click_events (offer_id);
-- CREATE INDEX idx_conversions_reported_at ON conversions (reported_at);
-- CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at);

-- Tables : profiles, settings, partners, partner_integrations, categories, products,
-- product_media, product_offers, commission_rules, campaigns, click_events, conversions,
-- commission_transactions, crm_contacts, crm_activities, consent_records, ai_assets,
-- social_posts, import_jobs, audit_logs, exchange_rates.
-- La source de vérité est prisma/schema.prisma (portable PostgreSQL sans changement de modèle).
