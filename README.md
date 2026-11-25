# The Math Store

Singapore Math books for homeschooling families. A static website (no build step) backed by Supabase.

- **Payment:** cash before delivery only. There is no payment gateway anywhere in the code or the database.
- **Storefront:** home story, shop by grade, product pages with versions (Without / With Parent Guide), order form with House/Street, Province, Municipality and Barangay.
- **Admin** (`#admin`): manage books, photos, prices, versions, stock and orders.

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | The whole site |
| `config.js` | Supabase URL and publishable key (safe to publish; row level security protects the data) |
| `supabase/migrations/` | Database setup: tables, security rules, order functions, photo bucket, starting catalog |

## How the data is protected

- Visitors can read published books, versions and photos. Nothing else.
- Visitors place orders only through the `place_order` function, which takes prices and stock from the database, not from the browser.
- Only users listed in the `admins` table can change books, photos, stock or orders.
- Never commit the Supabase `service_role` key or database password.

## Make yourself the admin

1. In Supabase, open Authentication, then Users, then Add user. Create your email and a strong password.
2. Run this in the Supabase SQL editor, with your email:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'you@example.com';
```

3. Open the site, go to `#admin`, and sign in.

Also in Supabase, under Authentication, Sign In / Providers, turn off "Allow new users to sign up" so only users you create can sign in.

## Publish with GitHub Pages

Repository Settings, then Pages, then deploy from branch `main`, folder `/ (root)`. Pages gives you a free `https://<user>.github.io/<repo>/` address.

## Placeholders to fill in

Search `app.js` for text in square brackets, such as `[YOUR DELIVERY FEE]`, and replace each with your real details.
