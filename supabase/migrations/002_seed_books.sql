-- Starting catalog: 10 Think! Mathematics sets and 2 kindergarten sets.
-- Each book gets "Without Parent Guide" (priced) and "With Parent Guide" (price on request until you set it in Admin).

insert into public.books (id, title, level, grade_label, sort, description, includes)
select 'g' || g,
  'Think! Mathematics Grade ' || g || ' Set',
  case when g <= 6 then 'primary' else 'secondary' end,
  'Grade ' || g, g * 10,
  'Think! Mathematics Grade ' || g || ' is a complete Singapore Math course for one school year. '
    || case when g <= 6 then 'Each lesson moves from hands-on objects to pictures to numbers, so your child understands why an answer works.'
            else 'Ideas are built up from clear examples, so your teen understands the reasoning behind each method.' end
    || E'\n\nThe textbooks teach each topic step by step. The workbooks give your '
    || case when g <= 6 then 'child' else 'teen' end || ' practice on what was just taught.',
  array['Textbook A','Textbook B','Workbook A','Workbook B']
from generate_series(1, 10) g;

insert into public.books (id, title, level, grade_label, sort, description, includes) values
('k1', 'Up Down All Around (Book 1–4)', 'kindergarten', 'Kindergarten', 110,
 'Up Down All Around is a four-book kindergarten math set for your youngest learner. Short, friendly activities build early number sense through play and pictures.', array['Books 1 to 4']),
('k2', 'Up Down All Around (Book 5–8)', 'kindergarten', 'Kindergarten', 120,
 'Up Down All Around continues with four more books for your young learner. Short, friendly activities keep building early number sense through play and pictures.', array['Books 5 to 8']);

insert into public.variants (book_id, name, price, sort)
select id, 'Without Parent Guide',
  case id when 'k1' then 2230 when 'k2' then 2030 else case when level = 'primary' then 2550 else 3350 end end, 1
from public.books;

insert into public.variants (book_id, name, price, sort)
select id, 'With Parent Guide', null, 2 from public.books;
