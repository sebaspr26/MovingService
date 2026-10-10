-- Truck type: box truck, dry van or reefer. NULL = "Sin elección" — every truck
-- that existed before this column stays NULL until someone picks its type.
alter table trucks add column if not exists truck_type text
  check (truck_type in ('box_truck', 'dry_van', 'reefer'));
