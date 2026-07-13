-- =====================================================================
-- Workshop Inventory System — Section 2
-- Migration 0004: seed categories, subcategories and quantity units
--
-- Categories/subcategories have stable generated IDs; the app exports these
-- so the ChatGPT project can reference them. AI must never create or rename
-- categories — this seed is the single source of truth for the initial set.
-- Re-running is safe (idempotent via unique-name conflicts).
-- =====================================================================

-- ---- Quantity units -------------------------------------------------
insert into workshop.units (name, abbreviation, sort_order)
select name, abbr, ord from (values
  ('Pieces','pcs',1), ('Packs','pack',2), ('Sets','set',3), ('Pairs','pair',4),
  ('Metres','m',5), ('Millimetres','mm',6), ('Litres','L',7),
  ('Millilitres','ml',8), ('Kilograms','kg',9), ('Grams','g',10),
  ('Rolls','roll',11), ('Spools','spool',12), ('Sheets','sheet',13),
  ('Boxes','box',14), ('Bottles','bottle',15), ('Tins','tin',16)
) as u(name, abbr, ord)
on conflict (name) do nothing;

-- ---- Categories -----------------------------------------------------
insert into workshop.categories (name, sort_order)
select name, ord from (values
  ('3D Printing',1),
  ('Fasteners & Fixings',2),
  ('Mechanical',3),
  ('Pneumatics & Air',4),
  ('Electrical & Electronics',5),
  ('Hand Tools',6),
  ('Power Tools & Accessories',7),
  ('Adhesives, Tape & Mounting',8),
  ('Paint & Finishing',9),
  ('Lighting & Heat',10),
  ('Labelling, Paper & Stationery',11),
  ('Storage & Workshop',12)
) as c(name, ord)
on conflict (name) do nothing;

-- ---- Subcategories --------------------------------------------------
-- Helper pattern: join category by name, insert its subcategories in order.

insert into workshop.subcategories (category_id, name, sort_order)
select c.id, s.name, s.ord from workshop.categories c
join (values
  ('Printers',1),('Printer accessories',2),('Build plates',3),('Filament',4),
  ('Filament accessories',5),('Printer spares',6),('Nozzles and hotends',7),
  ('Extruder parts',8),('Print-removal tools',9),('Printed parts',10),
  ('Resin-printing supplies',11)
) as s(name, ord) on c.name = '3D Printing'
on conflict (category_id, name) do nothing;

insert into workshop.subcategories (category_id, name, sort_order)
select c.id, s.name, s.ord from workshop.categories c
join (values
  ('Bolts and machine screws',1),('Nuts',2),('Washers',3),('Wood screws',4),
  ('Self-tapping screws',5),('Threaded rod',6),('Wall plugs and wall fixings',7),
  ('Anchors',8),('Pins and nails',9),('Staples',10),('Rivets',11),
  ('Cable ties',12),('Spacers and standoffs',13),('Clips and retainers',14),
  ('Hooks and eyes',15)
) as s(name, ord) on c.name = 'Fasteners & Fixings'
on conflict (category_id, name) do nothing;

insert into workshop.subcategories (category_id, name, sort_order)
select c.id, s.name, s.ord from workshop.categories c
join (values
  ('Bearings',1),('Bushes',2),('Seals and O-rings',3),('Springs',4),('Gears',5),
  ('Pulleys',6),('Belts',7),('Shafts and rods',8),('Brackets and plates',9),
  ('Hinges',10),('Wheels and castors',11),('Handles and knobs',12),
  ('Chains and links',13),('Small mechanical hardware',14),('Hanging hardware',15)
) as s(name, ord) on c.name = 'Mechanical'
on conflict (category_id, name) do nothing;

insert into workshop.subcategories (category_id, name, sort_order)
select c.id, s.name, s.ord from workshop.categories c
join (values
  ('Compressors',1),('Air tools',2),('Air hose and tubing',3),
  ('Push-fit fittings',4),('Brass fittings and adaptors',5),
  ('Couplers and connectors',6),('Regulators',7),('Valves',8),('Gauges',9),
  ('Cylinders and actuators',10),('Filters and lubricators',11),
  ('PTFE tape and thread seal',12),('Pneumatic accessories',13)
) as s(name, ord) on c.name = 'Pneumatics & Air'
on conflict (category_id, name) do nothing;

insert into workshop.subcategories (category_id, name, sort_order)
select c.id, s.name, s.ord from workshop.categories c
join (values
  ('Circuit boards and modules',1),('Microcontrollers',2),('Sensors',3),
  ('Relays',4),('Switches and buttons',5),('Connectors and terminals',6),
  ('Batteries',7),('Battery holders',8),('Power supplies and adaptors',9),
  ('Wire and cable',10),('USB cables and adaptors',11),
  ('Network cables and parts',12),('Audio and video cables',13),('Motors',14),
  ('Fans',15),('LEDs and lighting components',16),
  ('Resistors, capacitors and components',17),('Heat-shrink and insulation',18),
  ('Cable management',19),('Soldering supplies',20),('Electrical enclosures',21)
) as s(name, ord) on c.name = 'Electrical & Electronics'
on conflict (category_id, name) do nothing;

insert into workshop.subcategories (category_id, name, sort_order)
select c.id, s.name, s.ord from workshop.categories c
join (values
  ('Screwdrivers and bits',1),('Pliers',2),('Cutters',3),
  ('Wire strippers and crimpers',4),('Spanners and wrenches',5),
  ('Sockets and ratchets',6),('Hex and Torx keys',7),('Hammers and mallets',8),
  ('Files and rasps',9),('Saws',10),('Measuring tools',11),('Marking tools',12),
  ('Levels and squares',13),('Clamps',14),('Vices',15),('Knives and blades',16),
  ('Scrapers',17),('Scissors and shears',18),('Brushes',19),
  ('Pick-up and inspection tools',20),('Repair kits',21),('Tool sets',22)
) as s(name, ord) on c.name = 'Hand Tools'
on conflict (category_id, name) do nothing;

insert into workshop.subcategories (category_id, name, sort_order)
select c.id, s.name, s.ord from workshop.categories c
join (values
  ('Drills and drivers',1),('Rotary tools',2),('Saws and jigsaws',3),
  ('Sanders',4),('Grinders',5),('Planers and routers',6),('Heat guns',7),
  ('Power-tool batteries',8),('Battery chargers',9),('Drill bits',10),
  ('Driver bits',11),('Hole saws',12),('Cutting blades',13),
  ('Grinding discs',14),('Sanding consumables',15),('Polishing accessories',16),
  ('Power-tool attachments',17),('Power-tool spares',18)
) as s(name, ord) on c.name = 'Power Tools & Accessories'
on conflict (category_id, name) do nothing;

insert into workshop.subcategories (category_id, name, sort_order)
select c.id, s.name, s.ord from workshop.categories c
join (values
  ('General-purpose glue',1),('Superglue',2),('Epoxy',3),('Wood glue',4),
  ('Contact adhesive',5),('Hot-melt glue',6),('Sealants',7),
  ('Double-sided tape',8),('VHB tape',9),('Hook-and-loop products',10),
  ('Removable mounting products',11),('Masking and painter''s tape',12),
  ('Packing tape',13),('Duct and utility tape',14),('Electrical tape',15),
  ('Mounting pads and strips',16)
) as s(name, ord) on c.name = 'Adhesives, Tape & Mounting'
on conflict (category_id, name) do nothing;

insert into workshop.subcategories (category_id, name, sort_order)
select c.id, s.name, s.ord from workshop.categories c
join (values
  ('Interior paint',1),('Exterior paint',2),('Wood paint and finish',3),
  ('Metal paint',4),('Spray paint and coatings',5),('Primers',6),
  ('Varnish and lacquer',7),('Wood stain',8),('Fillers',9),
  ('Sandpaper and abrasives',10),('Polishing products',11),('Paintbrushes',12),
  ('Rollers and trays',13),('Cleaning products',14),('Cloths and wipes',15),
  ('Solvents and thinners',16)
) as s(name, ord) on c.name = 'Paint & Finishing'
on conflict (category_id, name) do nothing;

insert into workshop.subcategories (category_id, name, sort_order)
select c.id, s.name, s.ord from workshop.categories c
join (values
  ('Torches',1),('Work lights',2),('Lamps',3),('LED strips',4),('Heat tools',5),
  ('Gas tools',6),('Burners and torches',7),('Heating elements',8),
  ('Lighting accessories',9)
) as s(name, ord) on c.name = 'Lighting & Heat'
on conflict (category_id, name) do nothing;

insert into workshop.subcategories (category_id, name, sort_order)
select c.id, s.name, s.ord from workshop.categories c
join (values
  ('Labels',1),('Label rolls',2),('Label-printer supplies',3),('Pens',4),
  ('Permanent markers',5),('Paint markers',6),('Pencils',7),('Sticky notes',8),
  ('Paper',9),('Card',10),('Tape dispensers',11),
  ('Measuring and stationery supplies',12)
) as s(name, ord) on c.name = 'Labelling, Paper & Stationery'
on conflict (category_id, name) do nothing;

insert into workshop.subcategories (category_id, name, sort_order)
select c.id, s.name, s.ord from workshop.categories c
join (values
  ('Storage boxes',1),('Parts organisers',2),('Trays',3),('Bins and baskets',4),
  ('Gridfinity storage',5),('Shelving',6),('Benches',7),('Cabinets',8),
  ('Drawers',9),('Tool storage',10),('Cable storage',11),
  ('Workshop furniture',12),('Workshop cleaning',13),('Safety equipment',14),
  ('Packaging materials',15),('General workshop supplies',16)
) as s(name, ord) on c.name = 'Storage & Workshop'
on conflict (category_id, name) do nothing;
