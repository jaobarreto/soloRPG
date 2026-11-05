-- Blue Rose AGE creation focuses. This migration only adds catalog references.
INSERT INTO blue_rose_rules(id,kind,name,status,source,page,ability) VALUES
('dexterity-riding','FOCUS','Montar','IMPLEMENTED','local:blue-rose-age-br-2023','pp.36,69','DEXTERITY'),
('communication-deception','FOCUS','Enganar','IMPLEMENTED','local:blue-rose-age-br-2023','pp.36,69','COMMUNICATION'),
('dexterity-acrobatics','FOCUS','Acrobacia','IMPLEMENTED','local:blue-rose-age-br-2023','pp.37,69','DEXTERITY');
