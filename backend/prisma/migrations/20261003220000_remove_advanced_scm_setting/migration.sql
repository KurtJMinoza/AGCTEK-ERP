-- Setting removed from the catalog: Supply Chain Management toggle already covers these screens
DELETE FROM "system_settings" WHERE "key" = 'feature_advanced_scm_enabled';
