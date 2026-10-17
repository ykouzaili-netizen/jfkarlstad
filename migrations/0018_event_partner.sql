-- 0018: evenemang kopplas till en samarbetspartner (byrå) i stället för ett studentnätverk.
-- Kolumnen från 0017 hade inga värden i produktion när den döptes om.
ALTER TABLE events RENAME COLUMN network_id TO partner_id;
