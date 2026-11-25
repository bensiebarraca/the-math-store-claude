import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY, MESSENGER, FACEBOOK } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const SECTIONS = ['why', 'shelf', 'how', 'order'];
const PROVINCES = ['Abra','Agusan del Norte','Agusan del Sur','Aklan','Albay','Antique','Apayao','Aurora','Basilan','Bataan','Batanes','Batangas','Benguet','Biliran','Bohol','Bukidnon','Bulacan','Cagayan','Camarines Norte','Camarines Sur','Camiguin','Capiz','Catanduanes','Cavite','Cebu','Cotabato','Davao de Oro','Davao del Norte','Davao del Sur','Davao Occidental','Davao Oriental','Dinagat Islands','Eastern Samar','Guimaras','Ifugao','Ilocos Norte','Ilocos Sur','Iloilo','Isabela','Kalinga','La Union','Laguna','Lanao del Norte','Lanao del Sur','Leyte','Maguindanao del Norte','Maguindanao del Sur','Marinduque','Masbate','Metro Manila','Misamis Occidental','Misamis Oriental','Mountain Province','Negros Occidental','Negros Oriental','Northern Samar','Nueva Ecija','Nueva Vizcaya','Occidental Mindoro','Oriental Mindoro','Palawan','Pampanga','Pangasinan','Quezon','Quirino','Rizal','Romblon','Samar','Sarangani','Siquijor','Sorsogon','South Cotabato','Southern Leyte','Sultan Kudarat','Sulu','Surigao del Norte','Surigao del Sur','Tarlac','Tawi-Tawi','Zambales','Zamboanga del Norte','Zamboanga del Sur','Zamboanga Sibugay'];
const TONES = ['#1B6F6F','#2A58A0','#6B3FA0','#2F7D4A','#A02D6B','#1D3557','#8A5A00','#0F6B8F','#7A3E9D','#33691E','#C2410C','#B4235B'];
const LEVELS = { primary: 'Primary', secondary: 'Secondary', kindergarten: 'Kindergarten' };

const app = document.getElementById('app');
const S = {
  books: [], orders: [], ready: false, loadFailed: false,
  session: null, isAdmin: false, authChecked: false,
  cart: loadCart(), draft: {}, level: 'primary', sel: {}, qty: {}, gal: {},
  view: 'home', viewId: null, adminTab: 'books', editing: null, confirmDel: false,
  sent: null, busy: false, msg: '', uploading: false, login: { email: '', password: '' }
};

function loadCart() { try { return JSON.parse(localStorage.getItem('mathstore-cart') || '{}') || {}; } catch (e) { return {}; } }
function saveCart() { try { localStorage.setItem('mathstore-cart', JSON.stringify(S.cart)); } catch (e) {} }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function peso(n) { n = Number(n); return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }); }
function priced(v) { return v && v.price != null && v.price !== '' && !isNaN(Number(v.price)); }
function avail(v) { return v.stock == null || Number(v.stock) > 0; }
function stockLabel(v) { if (v.stock == null) return { t: 'In stock', c: '' }; const n = Number(v.stock); if (n <= 0) return { t: 'Sold out', c: 'bad' }; if (n <= 5) return { t: 'Only ' + n + ' left', c: 'warn' }; return { t: 'In stock', c: '' }; }
function fromPrice(p) { const ps = p.variants.filter(priced).map(v => Number(v.price)); return ps.length ? Math.min(...ps) : null; }
function allSold(p) { return p.variants.length > 0 && p.variants.every(v => !avail(v)); }
function findBook(id) { return S.books.find(p => p.id === id); }
const isLocal = p => !/^https?:/.test(p);
function imgUrl(path) { if (!isLocal(path)) return path; return sb.storage.from('book-images').getPublicUrl(path).data.publicUrl; }
function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3400); }
function toneFor(p) { const i = Math.max(0, Math.round((p.sort || 0) / 10) - 1); return TONES[i % TONES.length]; }

/* ---------- data ---------- */
function shapeBook(b) {
  return {
    id: b.id, title: b.title, level: b.level, gradeLabel: b.grade_label || '', sort: b.sort || 0,
    description: b.description || '', includes: b.includes || [], published: b.published,
    variants: (b.variants || []).slice().sort((a, c) => a.sort - c.sort).map(v => ({ id: v.id, name: v.name, price: v.price == null ? null : Number(v.price), stock: v.stock == null ? null : Number(v.stock) })),
    images: (b.book_images || []).slice().sort((a, c) => a.sort - c.sort).map(i => ({ id: i.id, path: i.path }))
  };
}
async function loadBooks() {
  const { data, error } = await sb.from('books').select('*, variants(*), book_images(*)').order('sort');
  if (error) { S.loadFailed = true; S.ready = true; return; }
  S.loadFailed = false; S.books = data.map(shapeBook); S.ready = true;
}
async function loadOrders() {
  const { data, error } = await sb.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }).limit(200);
  if (error) { toast('Could not load orders.'); return; }
  S.orders = data;
}
async function checkAdmin() {
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  S.isAdmin = false;
  if (S.session) { const r = await sb.rpc('is_admin'); S.isAdmin = r.data === true; }
  S.authChecked = true;
}

/* ---------- covers ---------- */
function coverHtml(p, big, imgPath) {
  const path = imgPath || (p.images && p.images[0] && p.images[0].path);
  if (path) return '<div class="cover' + (big ? ' big' : '') + '"><img src="' + esc(imgUrl(path)) + '" alt="' + esc(p.title) + '"></div>';
  const kind = p.level === 'kindergarten';
  let labels = ['TB A', 'TB B', 'WB A', 'WB B'];
  if (kind) { const m = /(\d)\s*[–-]\s*(\d)/.exec(p.title || ''); const s = m ? Number(m[1]) : 1; labels = [s, s + 1, s + 2, s + 3]; }
  const hs = [112, 112, 92, 92], tone = toneFor(p);
  return '<div class="cover' + (big ? ' big' : '') + '" role="img" aria-label="' + esc(p.title) + '">' + labels.map((l, i) =>
    '<div class="bk' + (!kind && i >= 2 ? ' wb' : '') + '" style="--tone:' + tone + ';--h:' + (kind ? 100 : hs[i]) + 'px">' + esc(l) + '</div>').join('') + '</div>';
}

/* ---------- routing ---------- */
function parseHash() {
  const h = location.hash.replace(/^#/, '');
  if (h === 'admin') return { view: 'admin' };
  if (h.indexOf('book-') === 0) return { view: 'product', id: h.slice(5) };
  return { view: 'home', section: SECTIONS.includes(h) ? h : null };
}
function route() {
  const r = parseHash(), changed = r.view !== S.view || r.id !== S.viewId;
  S.view = r.view; S.viewId = r.id || null;
  if (changed) S.msg = '';
  if (r.view === 'admin' && S.isAdmin && S.adminTab === 'orders') loadOrders().then(render);
  render();
  if (r.section) { const el = document.getElementById(r.section); if (el) el.scrollIntoView(); }
  else if (changed) window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ---------- shell ---------- */
function cartLines() {
  const out = [];
  Object.keys(S.cart).forEach(k => {
    for (const p of S.books) { const v = p.variants.find(x => x.id === k); if (v && priced(v) && S.cart[k] > 0) { out.push({ k, p, v, qty: S.cart[k] }); break; } }
  });
  return out;
}
function cartCount() { return cartLines().reduce((n, l) => n + l.qty, 0); }
function nav() {
  return '<div class="nav"><div class="in">'
    + '<a class="brand" href="#home"><span aria-hidden="true" style="display:flex;flex-direction:column;gap:3px;width:34px"><span style="height:12px;background:var(--ink);border-radius:3px"></span><span style="display:flex;gap:3px;height:12px"><span style="width:40%;background:var(--sun);border-radius:3px"></span><span style="flex:1;background:var(--teal-fill);border-radius:3px"></span></span></span>The Math Store</a>'
    + '<nav class="navlinks" aria-label="Main"><a href="#why">Why Singapore Math</a><a href="#shelf">Shop by grade</a><a href="#how">How ordering works</a>'
    + (S.isAdmin ? '<a href="#admin">Admin</a>' : '')
    + '<a class="pill" href="#order">Your order (' + cartCount() + ')</a></nav></div></div>';
}
function footer() {
  return '<div class="on-dark"><div class="in" style="padding-block:64px"><div class="row" style="justify-content:space-between;align-items:flex-start;gap:32px">'
    + '<div class="col" style="flex:1 1 320px;max-width:460px"><div style="font-family:\'Bricolage Grotesque\',sans-serif;font-weight:800;font-size:28px">The Math Store</div><p style="font-size:17px;line-height:1.6;color:var(--on-dark-muted)">Resources for the homeschooler. Singapore Math books for kindergarten, primary and secondary, delivered to your door.</p></div>'
    + '<div class="col" style="flex:1 1 260px;gap:10px"><div class="eyebrow">Questions? Talk to us</div><a style="color:#fff;font-size:17px;font-weight:600;min-height:44px;display:inline-flex;align-items:center" href="' + MESSENGER + '">Message us on Messenger</a><a style="color:#fff;font-size:17px;font-weight:600;min-height:44px;display:inline-flex;align-items:center" href="' + FACEBOOK + '">facebook.com/themathstoreph</a></div>'
    + '<div class="col" style="flex:1 1 260px;gap:10px"><div class="eyebrow">Payment</div><p style="font-size:17px;line-height:1.6;color:var(--on-dark-muted)">Cash before delivery only. We never ask for card details and do not use online payment gateways.</p></div>'
    + '</div></div></div>';
}

/* ---------- home ---------- */
function homeView() {
  const shown = S.books.filter(p => S.level === 'all' || p.level === S.level);
  const tabs = [['primary', 'Primary, Grades 1–6'], ['secondary', 'Secondary, Grades 7–10'], ['kindergarten', 'Kindergarten'], ['all', 'Show all']].map(t =>
    '<button type="button" class="tab' + (S.level === t[0] ? ' on' : '') + '" data-act="level" data-v="' + t[0] + '">' + t[1] + '</button>').join('');
  let cards;
  if (S.loadFailed) cards = '<div class="note warn">The shelf could not load right now. Please refresh, or message us on Messenger.</div>';
  else if (!S.ready) cards = '<p class="lead">Loading the shelf…</p>';
  else if (!shown.length) cards = '<div class="note">No books here yet.</div>';
  else cards = '<div class="grid">' + shown.map(p => {
    const fp = fromPrice(p), vs = p.variants;
    return '<a class="pcard" href="#book-' + esc(p.id) + '">' + coverHtml(p, false)
      + '<div class="col" style="gap:6px"><div class="tag">' + esc(LEVELS[p.level] || '') + (p.gradeLabel ? ' · ' + esc(p.gradeLabel) : '') + '</div>'
      + '<h3 style="font-size:22px">' + esc(p.title) + '</h3>'
      + (vs.length > 1 ? '<div class="small">' + vs.length + ' versions: ' + vs.map(v => esc(v.name)).join(' or ') + '</div>' : '') + '</div>'
      + '<div class="col" style="gap:10px;margin-top:auto"><div class="price">' + (fp != null ? (vs.length > 1 ? '<span style="font-size:15px;font-weight:600;font-family:Figtree,sans-serif">from </span>' : '') + peso(fp) : 'Ask for price') + '</div>'
      + (allSold(p) ? '<span class="pill-s bad" style="align-self:flex-start">Sold out</span>' : '')
      + '<span class="btn btn-ghost btn-sm" style="align-self:flex-start">View details</span></div></a>';
  }).join('') + '</div>';

  return '<div style="background:var(--hero)"><div class="in"><div class="row" style="align-items:center;gap:48px;padding-block:80px">'
    + '<div class="col" style="flex:1 1 460px;gap:24px"><div class="eyebrow">Singapore Math for homeschooling families</div><h1>Math your child will actually understand.</h1>'
    + '<p class="lead" style="max-width:540px">You do not need a teaching degree to teach this well. You need books that show the thinking, one clear step at a time. We stock the Singapore Math sets that do exactly that, from kindergarten to Grade 10.</p>'
    + '<div class="row" style="align-items:center;gap:16px"><a class="btn btn-sun" style="min-height:52px;font-size:17px;padding:0 28px" href="#shelf">Find my child\'s grade</a><a style="color:var(--ink);font-weight:600;font-size:17px;min-height:44px;display:inline-flex;align-items:center" href="#how">How ordering works</a></div>'
    + '<div style="font-weight:600;color:var(--muted)">Pay cash before delivery. No cards, no online accounts.</div></div>'
    + '<div class="col card" style="flex:1 1 400px;max-width:520px;padding:32px;border-radius:20px;gap:20px"><div class="eyebrow" style="color:var(--faint)">A bar model</div>'
    + '<div style="font-family:\'Bricolage Grotesque\',sans-serif;font-size:30px;font-weight:800;line-height:1.2">Ana has 47 stickers. She gives away 19. How many are left?</div>'
    + '<div class="col" style="gap:8px"><div style="display:flex;align-items:center;justify-content:center;height:48px;background:var(--dark);color:#fff;border-radius:8px;font-weight:700">47 in all</div>'
    + '<div style="display:flex;gap:8px;height:48px"><div style="display:flex;align-items:center;justify-content:center;width:40%;background:var(--sun);color:var(--on-sun);border-radius:8px;font-weight:700">19 given</div><div style="display:flex;align-items:center;justify-content:center;flex:1;background:var(--teal-fill);color:#fff;border-radius:8px;font-weight:700;font-size:22px">?</div></div></div>'
    + '<p style="color:var(--muted)">One picture, and the child sees that 47 − 19 is the missing part. No memorized trick needed.</p></div></div></div></div>'

    + '<div id="why"><div class="in sec"><div class="row" style="gap:48px"><div class="col" style="flex:1 1 380px;gap:20px"><div class="eyebrow">It usually starts at the kitchen table</div><h2>You showed the steps. She still asks why.</h2></div>'
    + '<div class="col" style="flex:1 1 460px;gap:20px;font-size:19px;line-height:1.65;color:var(--muted)"><p>It is a Tuesday morning. Your daughter is staring at 47 − 19. She can follow the borrowing steps you showed her. She cannot tell you why they work, and by tomorrow she will have forgotten them.</p><p>Most of us learned math as rules to memorize. When you teach at home, you notice how little of it we understood. You are a chapter ahead of your child and quietly hoping she does not ask the hard question.</p><p style="font-weight:600;color:var(--ink)">Singapore Math begins somewhere else. It begins with what a number actually means. That is why homeschooling moms keep recommending it, and why a good set of books matters so much.</p></div></div></div></div>'

    + '<div class="on-dark"><div class="in sec"><div class="col" style="gap:48px"><div class="col" style="max-width:720px"><div class="eyebrow">How a lesson unfolds</div><h2>Every idea is taught in three steps, always in this order.</h2></div>'
    + '<div class="row">' + [['Step 1', 'See it', 'Your child starts with real things she can touch: blocks, counters, beads. Seven blocks and three blocks make ten, and she sees it happen.'], ['Step 2', 'Draw it', 'Next the blocks become pictures, then simple bars. Word problems stop being a wall of text and turn into a shape she can read.'], ['Step 3', 'Write it', 'Only then do the numbers and symbols arrive. By now they carry meaning, so the math sticks, and the workbooks give her room to practice.']].map(s =>
      '<div class="col" style="flex:1 1 280px;padding:28px;background:var(--card-dark);border-radius:16px;gap:12px"><div class="eyebrow">' + s[0] + '</div><h3 style="font-size:28px">' + s[1] + '</h3><p style="font-size:17px;line-height:1.6;color:var(--on-dark-muted)">' + s[2] + '</p></div>').join('') + '</div>'
    + '<p style="font-size:19px;line-height:1.6;color:var(--on-dark-muted);max-width:720px">The textbook explains. The workbook practices. You guide. That is the whole homeschool rhythm, and each grade set below gives you both.</p></div></div></div>'

    + '<div id="shelf"><div class="in sec"><div class="col" style="gap:40px"><div class="col" style="max-width:720px"><div class="eyebrow">Shop by grade</div><h2>Pick your child\'s grade. Everything for the year comes in one set.</h2>'
    + '<p class="lead" style="font-size:18px">Each Think! Mathematics set includes Textbook A and B and Workbook A and B, so you have the full year on your shelf. Tap a book to see its details and choose with or without the Parent Guide.</p></div>'
    + '<div class="tabs" role="group" aria-label="Filter by level">' + tabs + '</div>' + cards + '</div></div></div>'

    + '<div id="how" style="background:var(--mint)"><div class="in sec"><div class="col" style="gap:40px"><div class="col" style="max-width:720px"><div class="eyebrow" style="color:var(--mint-ink)">Cash before delivery</div><h2>Ordering is simple, and your payment details stay with you.</h2></div>'
    + '<div class="row">' + [['Step 1', 'Choose your sets', 'Pick the grades you need, then send us your name, mobile number and delivery address.'], ['Step 2', 'We confirm with you', 'A real person messages you to confirm stock, your final total and delivery. [YOUR DELIVERY AREAS, FEES AND TIMES]'], ['Step 3', 'Pay cash, then we deliver', 'You pay in cash before your books go out. [YOUR CASH PAYMENT INSTRUCTIONS] No card numbers and no payment gateway, ever.']].map(s =>
      '<div class="col card" style="flex:1 1 260px;padding:28px;gap:10px;border-radius:16px"><div class="eyebrow" style="color:var(--mint-ink)">' + s[0] + '</div><h3>' + s[1] + '</h3><p style="color:var(--muted);line-height:1.6">' + s[2] + '</p></div>').join('') + '</div></div></div></div>'
    + orderSection();
}

/* ---------- order section ---------- */
function fld(f, label, o) {
  o = o || {}; const val = esc(S.draft[f] || '');
  return '<label class="fld" style="' + (o.wide ? 'flex-basis:100%' : '') + '"><span>' + label + '</span>'
    + (o.area ? '<textarea data-f="' + f + '" rows="2">' + val + '</textarea>' : '<input data-f="' + f + '" type="' + (o.type || 'text') + '" value="' + val + '" autocomplete="' + (o.ac || 'off') + '"' + (o.list ? ' list="' + o.list + '"' : '') + '>') + '</label>';
}
function orderText(o) {
  return 'Order ' + o.ref + '\nName: ' + o.customer.name + '\nMobile: ' + o.customer.mobile + '\nAddress: ' + [o.customer.street, o.customer.barangay, o.customer.municipality, o.customer.province].join(', ')
    + (o.customer.notes ? '\nNotes: ' + o.customer.notes : '') + '\nItems:\n' + o.lines.map(l => '- ' + l.qty + ' x ' + l.title + ' (' + l.variant + ') ' + peso(l.price * l.qty)).join('\n') + '\nTotal: ' + peso(o.total) + ' (cash before delivery)';
}
function orderSection() {
  const lines = cartLines(), total = lines.reduce((t, l) => t + Number(l.v.price) * l.qty, 0);
  let body;
  if (S.sent) {
    body = '<div class="col card" style="max-width:680px;padding:36px;border:2px solid var(--teal);border-radius:20px"><h3 style="font-size:30px">Order request received.</h3>'
      + '<p style="font-size:18px;line-height:1.6;color:var(--muted)">Thank you! Your reference is <b>' + esc(S.sent.ref) + '</b>. We will message you to confirm your total and delivery details. You pay cash before we deliver.</p>'
      + '<textarea readonly rows="9" aria-label="Order details" style="font-size:14px">' + esc(orderText(S.sent)) + '</textarea>'
      + '<div class="row" style="gap:12px"><button type="button" class="btn btn-sm" data-act="copyorder">Copy order details</button><a class="btn btn-ghost btn-sm" href="' + MESSENGER + '">Open Messenger</a><button type="button" class="btn btn-ghost btn-sm" data-act="again">Start another order</button></div></div>';
  } else {
    const sum = '<div class="col card" style="flex:1 1 420px;padding:28px;border-radius:20px;gap:16px"><h3>Order summary</h3>'
      + (lines.length ? '' : '<p style="color:var(--muted)">Your order is empty. Choose a book above to add it.</p>')
      + lines.map(l => {
        const maxed = l.v.stock != null && l.qty >= Number(l.v.stock);
        return '<div class="row" style="align-items:center;justify-content:space-between;gap:12px;padding-bottom:16px;border-bottom:1px solid var(--line)">'
          + '<div class="col" style="flex:1 1 200px;gap:4px"><a href="#book-' + esc(l.p.id) + '" style="color:var(--ink);font-weight:700;font-size:17px">' + esc(l.p.title) + '</a><div class="small">' + esc(l.v.name) + ' · ' + peso(l.v.price) + ' each</div></div>'
          + '<div class="step"><button type="button" aria-label="Remove one" data-act="cdec" data-k="' + esc(l.k) + '">−</button><b>' + l.qty + '</b><button type="button" aria-label="Add one" data-act="cinc" data-k="' + esc(l.k) + '"' + (maxed ? ' disabled' : '') + '>+</button></div>'
          + '<div style="min-width:96px;text-align:right;font-weight:700;font-size:18px">' + peso(Number(l.v.price) * l.qty) + '</div></div>';
      }).join('')
      + '<div class="row" style="align-items:center;justify-content:space-between"><div style="font-weight:600;font-size:17px">Books subtotal</div><div class="price" style="font-size:32px">' + peso(total) + '</div></div>'
      + '<div class="small">Delivery fee, if any, is confirmed when we message you. [YOUR DELIVERY FEE]</div>'
      + '<div class="note"><b>Payment: cash before delivery.</b> Nothing is charged online. You pay in cash once we have confirmed your order.</div></div>';
    const form = '<div class="col card" style="flex:1 1 420px;padding:28px;border-radius:20px;gap:18px"><h3>Where should we deliver?</h3>'
      + '<div class="row" style="gap:16px">' + fld('name', 'Your name', { ac: 'name' }) + fld('mobile', 'Mobile number', { type: 'tel', ac: 'tel' }) + '</div>'
      + fld('street', 'House/Street', { wide: true, ac: 'street-address' })
      + '<div class="row" style="gap:16px">' + fld('province', 'Province', { list: 'provinces' }) + fld('municipality', 'Municipality') + fld('barangay', 'Barangay') + '</div>'
      + fld('notes', 'Notes (optional)', { area: true, wide: true })
      + (S.msg ? '<div class="note err" role="alert">' + esc(S.msg) + '</div>' : '')
      + '<button type="button" class="btn" style="min-height:52px;font-size:17px" data-act="send"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Sending…' : 'Send my order request') + '</button>'
      + '<div class="small">Sending this does not charge you. We will reply on Messenger or by mobile to confirm.</div></div>';
    body = '<div class="row" style="gap:32px;align-items:flex-start">' + sum + form + '</div>';
  }
  return '<div id="order"><div class="in sec"><div class="col" style="gap:40px"><div class="col" style="max-width:720px"><div class="eyebrow">Your order</div><h2>Almost on your shelf.</h2></div>' + body + '</div></div></div>';
}
async function sendOrder() {
  const d = S.draft, lines = cartLines();
  const req = [['name', 'your name'], ['mobile', 'your mobile number'], ['street', 'House/Street'], ['province', 'Province'], ['municipality', 'Municipality'], ['barangay', 'Barangay']];
  if (!lines.length) { S.msg = 'Add at least one book to your order.'; return render(); }
  const miss = req.find(r => !(d[r[0]] || '').trim());
  if (miss) { S.msg = 'Please fill in ' + miss[1] + '.'; return render(); }
  S.busy = true; S.msg = ''; render();
  const customer = { name: d.name.trim(), mobile: d.mobile.trim(), street: d.street.trim(), province: d.province.trim(), municipality: d.municipality.trim(), barangay: d.barangay.trim(), notes: (d.notes || '').trim() };
  const { data, error } = await sb.rpc('place_order', { p_customer: customer, p_items: lines.map(l => ({ variant_id: l.v.id, qty: l.qty })) });
  S.busy = false;
  if (error) { S.msg = error.message || 'Your order could not be sent. Please try again, or message us on Messenger.'; await loadBooks(); return render(); }
  S.sent = { ref: data, customer, total: lines.reduce((t, l) => t + Number(l.v.price) * l.qty, 0), lines: lines.map(l => ({ title: l.p.title, variant: l.v.name, price: Number(l.v.price), qty: l.qty })) };
  S.cart = {}; saveCart(); render();
  const el = document.getElementById('order'); if (el) el.scrollIntoView();
}

/* ---------- product page ---------- */
function selVariant(p) {
  const v = p.variants.find(x => x.id === S.sel[p.id]);
  return v || p.variants.find(x => priced(x) && avail(x)) || p.variants[0];
}
function productView() {
  const p = findBook(S.viewId);
  const back = '<a href="#shelf" style="display:inline-flex;align-items:center;min-height:44px;font-weight:600;color:var(--ink)">← All books</a>';
  if (!S.ready) return '<div class="in" style="padding-block:48px">' + back + '<p class="lead">Loading…</p></div>';
  if (!p) return '<div class="in" style="padding-block:48px"><div class="col" style="gap:16px">' + back + '<h2>We could not find that book.</h2><a class="btn btn-sm" style="align-self:flex-start" href="#shelf">Back to the shelf</a></div></div>';
  const v = selVariant(p), vs = p.variants, imgs = p.images, gi = Math.min(S.gal[p.id] || 0, Math.max(0, imgs.length - 1));
  const main = coverHtml(p, true, imgs.length ? imgs[gi].path : null);
  const thumbs = imgs.length > 1 ? '<div class="thumbs">' + imgs.map((im, i) => '<button type="button" class="' + (i === gi ? 'on' : '') + '" aria-label="Photo ' + (i + 1) + '" data-act="gal" data-i="' + i + '"><img src="' + esc(imgUrl(im.path)) + '" alt=""></button>').join('') + '</div>' : '';
  let q = S.qty[p.id] || 1; if (v && v.stock != null) q = Math.min(q, Math.max(1, v.stock));
  const can = v && priced(v) && avail(v), sl = v ? stockLabel(v) : null;
  const desc = (p.description || '').split(/\n\s*\n/).filter(Boolean).map(t => '<p style="font-size:18px;line-height:1.65;color:var(--muted);white-space:pre-line">' + esc(t) + '</p>').join('');
  const inc = p.includes.length ? '<div class="col" style="gap:8px"><h3 style="font-size:20px">What is in the set</h3><ul style="margin:0;padding-left:22px;color:var(--muted);line-height:1.8">' + p.includes.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul></div>' : '';
  return '<div class="in" style="padding-block:32px 96px"><div class="col" style="gap:24px">' + back
    + (p.published === false ? '<div class="note warn">This book is hidden from customers. Only you can see this page.</div>' : '')
    + '<div class="row" style="gap:48px;align-items:flex-start"><div class="col" style="flex:1 1 420px;gap:16px">' + main + thumbs + '</div>'
    + '<div class="col" style="flex:1 1 420px;gap:22px"><div class="tag">' + esc(LEVELS[p.level] || '') + (p.gradeLabel ? ' · ' + esc(p.gradeLabel) : '') + '</div><h1 style="font-size:clamp(32px,4.5vw,48px)">' + esc(p.title) + '</h1>'
    + '<div class="col" style="gap:10px"><div class="price" style="font-size:36px">' + (v && priced(v) ? peso(v.price) : 'Price on request') + '</div>'
    + (sl ? '<span class="pill-s ' + sl.c + '" style="align-self:flex-start">' + sl.t + '</span>' : '') + '</div>'
    + (vs.length > 1 ? '<div class="col" style="gap:10px"><div style="font-weight:700">Choose a version</div><div class="chips" role="group" aria-label="Version">' + vs.map(x =>
      '<button type="button" class="chip' + (v && x.id === v.id ? ' on' : '') + '" data-act="variant" data-id="' + esc(x.id) + '">' + esc(x.name) + '<div class="small" style="margin-top:2px">' + (priced(x) ? peso(x.price) : 'Price on request') + (avail(x) ? '' : ' · Sold out') + '</div></button>').join('') + '</div></div>' : '')
    + (v && !priced(v) ? '<div class="note warn">This version is priced on request. <a href="' + MESSENGER + '">Message us</a> for the price.</div>' : '')
    + '<div class="row" style="align-items:center;gap:16px"><div class="step" aria-label="Quantity"><button type="button" aria-label="Fewer" data-act="qdec">−</button><b>' + q + '</b><button type="button" aria-label="More" data-act="qinc"' + (v && v.stock != null && q >= v.stock ? ' disabled' : '') + '>+</button></div>'
    + '<button type="button" class="btn btn-sun" style="min-height:52px;font-size:17px;padding:0 28px" data-act="add"' + (can ? '' : ' disabled') + '>Add to order</button></div>'
    + '<div class="note"><b>Cash before delivery.</b> No online payment. We confirm your total on Messenger first.</div>'
    + desc + inc + '</div></div></div></div>';
}

/* ---------- admin ---------- */
function adminView() {
  if (!S.authChecked) return '<div class="in" style="padding-block:64px"><p class="lead">Loading…</p></div>';
  if (!S.session) {
    return '<div class="in" style="padding-block:64px"><div class="col card" style="max-width:460px;gap:16px;padding:28px"><h2 style="font-size:32px">Owner sign in</h2>'
      + '<label class="fld"><span>Email</span><input id="login-email" type="email" autocomplete="username" data-login="email" value="' + esc(S.login.email) + '"></label>'
      + '<label class="fld"><span>Password</span><input id="login-pass" type="password" autocomplete="current-password" data-login="password" value="' + esc(S.login.password) + '"></label>'
      + (S.msg ? '<div class="note err" role="alert">' + esc(S.msg) + '</div>' : '')
      + '<button type="button" class="btn" data-act="login"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Signing in…' : 'Sign in') + '</button></div></div>';
  }
  if (!S.isAdmin) return '<div class="in" style="padding-block:64px"><div class="col card" style="max-width:560px;gap:12px"><h2 style="font-size:32px">This account is not an admin.</h2><p style="color:var(--muted)">You are signed in as ' + esc(S.session.user.email) + '. Ask the store owner to add you as an admin.</p><button type="button" class="btn btn-ghost btn-sm" style="align-self:flex-start" data-act="logout">Sign out</button></div></div>';
  const newOrders = S.orders.filter(o => o.status === 'new').length;
  const tabs = [['books', 'Books'], ['inventory', 'Inventory'], ['orders', 'Orders' + (newOrders ? ' (' + newOrders + ' new)' : '')]].map(t => '<button type="button" class="tab' + (S.adminTab === t[0] ? ' on' : '') + '" data-act="adm-tab" data-v="' + t[0] + '">' + t[1] + '</button>').join('');
  const inner = S.adminTab === 'books' ? adminBooks() : S.adminTab === 'inventory' ? adminInventory() : adminOrders();
  return '<div class="in" style="padding-block:40px 96px"><div class="col" style="gap:28px"><div class="row" style="justify-content:space-between;align-items:flex-end"><div class="col" style="gap:8px"><div class="eyebrow">Store owner</div><h2 style="font-size:36px">Admin</h2><p class="small">Changes save to the live store right away for everyone.</p></div><button type="button" class="btn btn-ghost btn-sm" data-act="logout">Sign out</button></div><div class="tabs">' + tabs + '</div>' + inner + '</div></div>';
}
function adminBooks() {
  const list = S.books.map(p => '<button type="button" class="arow' + (S.editing && S.editing.id === p.id ? ' on' : '') + '" data-act="adm-edit" data-id="' + esc(p.id) + '"><span>' + esc(p.title) + '</span><span class="pill-s' + (p.published === false ? ' warn' : '') + '">' + (p.published === false ? 'Hidden' : 'Live') + '</span></button>').join('');
  const ed = S.editing ? editor(S.editing) : '<div class="card" style="flex:1 1 480px"><p style="color:var(--muted)">Choose a book on the left to edit its photos, title, description, versions, prices and stock, or add a new book.</p></div>';
  return '<div class="row" style="gap:24px;align-items:flex-start"><div class="col" style="flex:0 1 320px;width:100%;gap:10px"><button type="button" class="btn btn-sun" data-act="adm-new">Add a new book</button>' + (list || '<p class="small">No books yet.</p>') + '</div>' + ed + '</div>';
}
function editor(e) {
  const vrows = e.variants.map((v, i) =>
    '<div class="vrow"><label class="fld" style="flex:2 1 200px"><span>Version name</span><input data-vf="name" data-i="' + i + '" value="' + esc(v.name) + '"></label>'
    + '<label class="fld" style="flex:1 1 110px"><span>Price (₱)</span><input type="number" min="0" step="any" data-vf="price" data-i="' + i + '" value="' + (v.price == null ? '' : esc(v.price)) + '" placeholder="On request"></label>'
    + '<label class="fld" style="flex:1 1 110px"><span>Stock</span><input type="number" min="0" step="1" data-vf="stock" data-i="' + i + '" value="' + (v.stock == null ? '' : esc(v.stock)) + '" placeholder="Not tracked"></label>'
    + '<button type="button" class="btn btn-ghost btn-sm" data-act="adm-rmvar" data-i="' + i + '">Remove</button></div>').join('');
  const imgs = e.images.map((im, i) => '<div class="imgc"><img src="' + esc(imgUrl(im.path)) + '" alt="Photo ' + (i + 1) + '">' + (i === 0 ? '<span class="pill-s" style="align-self:flex-start">Cover</span>' : '<button type="button" class="btn btn-ghost btn-sm" data-act="adm-cover" data-i="' + i + '">Make cover</button>') + '<button type="button" class="btn btn-ghost btn-sm" data-act="adm-rmimg" data-i="' + i + '">Remove</button></div>').join('');
  return '<div class="col card" style="flex:1 1 520px;min-width:0;gap:20px;padding:24px"><h3>' + (e.isNew ? 'New book' : 'Edit book') + '</h3>'
    + '<label class="fld"><span>Title</span><input data-e="title" value="' + esc(e.title) + '"></label>'
    + '<div class="row" style="gap:16px"><label class="fld"><span>Level</span><select data-e="level"><option value="kindergarten"' + (e.level === 'kindergarten' ? ' selected' : '') + '>Kindergarten</option><option value="primary"' + (e.level === 'primary' ? ' selected' : '') + '>Primary</option><option value="secondary"' + (e.level === 'secondary' ? ' selected' : '') + '>Secondary</option></select></label>'
    + '<label class="fld"><span>Grade label (optional)</span><input data-e="gradeLabel" value="' + esc(e.gradeLabel) + '" placeholder="Grade 3"></label>'
    + '<label class="fld" style="flex:0 1 120px"><span>Position</span><input type="number" step="1" data-e="sort" value="' + esc(e.sort) + '"></label></div>'
    + '<label class="fld"><span>Description (blank line starts a new paragraph)</span><textarea data-e="description" rows="5">' + esc(e.description) + '</textarea></label>'
    + '<label class="fld"><span>What is in the set (one item per line)</span><textarea data-e="includesText" rows="4">' + esc(e.includesText) + '</textarea></label>'
    + '<div class="col" style="gap:10px"><div style="font-weight:700">Photos</div><div class="imgs">' + (imgs || '<p class="small">No photos yet. The shop shows a drawn book stack until you add one.</p>') + '</div>'
    + '<label class="btn btn-ghost btn-sm" style="align-self:flex-start;cursor:pointer;position:relative">' + (S.uploading ? 'Uploading…' : 'Upload a photo') + '<input type="file" accept="image/png,image/jpeg,image/webp" data-file="img" style="position:absolute;width:1px;height:1px;opacity:0"' + (S.uploading ? ' disabled' : '') + '></label></div>'
    + '<div class="col" style="gap:10px"><div style="font-weight:700">Versions, prices and stock</div>' + vrows + '<button type="button" class="btn btn-ghost btn-sm" style="align-self:flex-start" data-act="adm-addvar">Add a version</button><p class="small">Leave Stock empty if you do not want to track it. Leave Price empty to show "Price on request".</p></div>'
    + '<label style="display:flex;align-items:center;gap:10px;font-weight:600"><input type="checkbox" data-e="published" style="width:24px;min-height:24px"' + (e.published ? ' checked' : '') + '> Show this book in the store</label>'
    + (S.msg ? '<div class="note err" role="alert">' + esc(S.msg) + '</div>' : '')
    + '<div class="row" style="gap:12px"><button type="button" class="btn" data-act="adm-save"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Saving…' : 'Save book') + '</button><button type="button" class="btn btn-ghost" data-act="adm-cancel">Close</button>'
    + (e.isNew ? '' : (S.confirmDel ? '<button type="button" class="btn btn-danger" data-act="adm-del-yes">Yes, delete this book</button>' : '<button type="button" class="btn btn-danger" data-act="adm-del">Delete book</button>')) + '</div></div>';
}
function adminInventory() {
  let rows = '', low = 0, out = 0;
  S.books.forEach(p => p.variants.forEach(v => {
    const sl = stockLabel(v); if (v.stock != null) { if (v.stock <= 0) out++; else if (v.stock <= 5) low++; }
    rows += '<tr><td>' + esc(p.title) + '</td><td>' + esc(v.name) + '</td><td>' + (priced(v) ? peso(v.price) : '<span class="small">On request</span>') + '</td>'
      + '<td><div class="step"><button type="button" aria-label="One less" data-act="inv-dec" data-v="' + esc(v.id) + '">−</button>'
      + '<input type="number" min="0" step="1" style="width:92px" aria-label="Stock for ' + esc(p.title + ' ' + v.name) + '" data-inv="' + esc(v.id) + '" value="' + (v.stock == null ? '' : esc(v.stock)) + '" placeholder="—">'
      + '<button type="button" aria-label="One more" data-act="inv-inc" data-v="' + esc(v.id) + '">+</button></div></td>'
      + '<td><span class="pill-s ' + (v.stock == null ? '' : sl.c) + '">' + (v.stock == null ? 'Not tracked' : sl.t) + '</span></td></tr>';
  }));
  return '<div class="col" style="gap:16px"><div class="row" style="gap:12px"><span class="pill-s bad">' + out + ' sold out</span><span class="pill-s warn">' + low + ' running low (5 or fewer)</span></div>'
    + '<p class="small">Type a number and press Tab or Enter to save. Leave a box empty to stop tracking stock for that version. Confirming an order deducts its books automatically.</p>'
    + (rows ? '<div class="tablewrap"><table><thead><tr><th>Book</th><th>Version</th><th>Price</th><th>Stock</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<p class="small">No books yet.</p>') + '</div>';
}
function adminOrders() {
  const label = { new: 'New', confirmed: 'Confirmed', delivered: 'Delivered', cancelled: 'Cancelled' };
  const head = '<div class="row" style="justify-content:space-between;align-items:center"><p class="small">Newest first.</p><button type="button" class="btn btn-ghost btn-sm" data-act="ord-refresh">Refresh</button></div>';
  if (!S.orders.length) return '<div class="col" style="gap:16px">' + head + '<div class="card"><p style="color:var(--muted)">No orders yet. New order requests from customers appear here.</p></div></div>';
  return '<div class="col" style="gap:16px">' + head + S.orders.map(o => {
    let acts = '';
    if (o.status === 'new') acts = '<button type="button" class="btn btn-sm" data-act="ord" data-o="' + esc(o.id) + '" data-s="confirmed">Confirm and deduct stock</button><button type="button" class="btn btn-danger btn-sm" data-act="ord" data-o="' + esc(o.id) + '" data-s="cancelled">Cancel</button>';
    else if (o.status === 'confirmed') acts = '<button type="button" class="btn btn-sm" data-act="ord" data-o="' + esc(o.id) + '" data-s="delivered">Mark delivered</button><button type="button" class="btn btn-danger btn-sm" data-act="ord" data-o="' + esc(o.id) + '" data-s="cancelled">Cancel and restock</button>';
    return '<div class="col card" style="gap:12px"><div class="row" style="justify-content:space-between;align-items:center;gap:12px"><b style="font-size:18px">' + esc(o.ref) + '</b><span class="pill-s ' + (o.status === 'new' ? 'warn' : o.status === 'cancelled' ? 'bad' : '') + '">' + (label[o.status] || esc(o.status)) + '</span></div>'
      + '<div class="small">' + esc(new Date(o.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })) + '</div>'
      + '<div><b>' + esc(o.customer_name) + '</b> · ' + esc(o.mobile) + '</div><div style="color:var(--muted)">' + esc([o.street, o.barangay, o.municipality, o.province].join(', ')) + '</div>'
      + (o.notes ? '<div class="small">Notes: ' + esc(o.notes) + '</div>' : '')
      + '<ul style="margin:0;padding-left:20px;line-height:1.7">' + (o.order_items || []).map(l => '<li>' + l.qty + ' × ' + esc(l.book_title) + ' (' + esc(l.variant_name) + ') · ' + peso(l.unit_price * l.qty) + '</li>').join('') + '</ul>'
      + '<div style="font-weight:700;font-size:18px">Total ' + peso(o.total) + ' · cash before delivery</div>' + (acts ? '<div class="row" style="gap:12px">' + acts + '</div>' : '') + '</div>';
  }).join('') + '</div>';
}

/* ---------- admin actions ---------- */
function newBook() {
  const mx = S.books.reduce((m, p) => Math.max(m, p.sort || 0), 0);
  return { id: 'b' + Date.now().toString(36), isNew: true, title: '', level: 'primary', gradeLabel: '', sort: mx + 10, description: '', includesText: '', images: [], removedImages: [], removedVariants: [], published: true,
    variants: [{ id: crypto.randomUUID(), isNew: true, name: 'Without Parent Guide', price: null, stock: null }, { id: crypto.randomUUID(), isNew: true, name: 'With Parent Guide', price: null, stock: null }] };
}
function toEditing(p) {
  return { id: p.id, isNew: false, title: p.title, level: p.level, gradeLabel: p.gradeLabel, sort: p.sort, description: p.description, includesText: p.includes.join('\n'), published: p.published,
    images: p.images.map(i => ({ id: i.id, path: i.path })), removedImages: [], removedVariants: [],
    variants: p.variants.map(v => ({ id: v.id, name: v.name, price: v.price, stock: v.stock })) };
}
async function saveBook() {
  const e = S.editing; S.msg = '';
  if (!e.title.trim()) { S.msg = 'Give the book a title.'; return render(); }
  if (!e.variants.length) { S.msg = 'Add at least one version.'; return render(); }
  if (e.variants.some(v => !String(v.name).trim())) { S.msg = 'Every version needs a name.'; return render(); }
  if (e.variants.some(v => (v.price != null && v.price < 0) || (v.stock != null && v.stock < 0))) { S.msg = 'Prices and stock cannot be negative.'; return render(); }
  S.busy = true; render();
  try {
    let r = await sb.from('books').upsert({ id: e.id, title: e.title.trim(), level: e.level, grade_label: e.gradeLabel.trim(), sort: Number(e.sort) || 0, description: e.description.trim(), includes: e.includesText.split('\n').map(t => t.trim()).filter(Boolean), published: e.published });
    if (r.error) throw r.error;
    r = await sb.from('variants').upsert(e.variants.map((v, i) => ({ id: v.id, book_id: e.id, name: String(v.name).trim(), price: v.price == null || v.price === '' ? null : Number(v.price), stock: v.stock == null || v.stock === '' ? null : Math.floor(Number(v.stock)), sort: i + 1 })));
    if (r.error) throw r.error;
    if (e.removedVariants.length) { r = await sb.from('variants').delete().in('id', e.removedVariants); if (r.error) throw r.error; }
    const kept = e.images.filter(i => i.id), fresh = e.images.filter(i => !i.id);
    for (let i = 0; i < kept.length; i++) { r = await sb.from('book_images').update({ sort: i }).eq('id', kept[i].id); if (r.error) throw r.error; }
    if (fresh.length) { r = await sb.from('book_images').insert(fresh.map(im => ({ book_id: e.id, path: im.path, sort: e.images.indexOf(im) }))); if (r.error) throw r.error; }
    if (e.removedImages.length) {
      const ids = e.removedImages.filter(i => i.id).map(i => i.id);
      if (ids.length) { r = await sb.from('book_images').delete().in('id', ids); if (r.error) throw r.error; }
      const rp = e.removedImages.map(i => i.path).filter(isLocal);
      if (rp.length) await sb.storage.from('book-images').remove(rp);
    }
    await loadBooks(); S.busy = false; S.editing = null; S.confirmDel = false; toast('Book saved.'); render();
  } catch (err) { S.busy = false; S.msg = 'Could not save: ' + (err.message || 'please try again.'); render(); }
}
async function setStock(vid, val) {
  const { error } = await sb.from('variants').update({ stock: val }).eq('id', vid);
  if (error) { toast('Could not update stock.'); return; }
  await loadBooks(); render(); toast('Stock updated.');
}
async function setOrderStatus(oid, status) {
  const { error } = await sb.rpc('set_order_status', { p_order: oid, p_status: status });
  if (error) { toast(error.message || 'Could not update the order.'); return; }
  await Promise.all([loadOrders(), loadBooks()]); render(); toast('Order updated.');
}
function shrink(file) {
  return createImageBitmap(file).then(b => {
    const sc = Math.min(1, 1400 / Math.max(b.width, b.height)), c = document.createElement('canvas');
    c.width = Math.round(b.width * sc); c.height = Math.round(b.height * sc);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(b, 0, 0, c.width, c.height);
    return new Promise((res, rej) => c.toBlob(bl => bl ? res(bl) : rej(new Error('encode')), 'image/jpeg', 0.86));
  });
}
async function discardNewUploads() {
  if (!S.editing) return;
  const orphans = S.editing.images.filter(i => !i.id).map(i => i.path).filter(isLocal);
  if (orphans.length) await sb.storage.from('book-images').remove(orphans);
}

/* ---------- render + events ---------- */
function render() {
  const body = S.view === 'admin' ? adminView() : S.view === 'product' ? productView() : homeView();
  const a = document.activeElement, id = a && a.id, f = a && (a.dataset.f || a.dataset.e), pos = a && a.selectionStart;
  app.innerHTML = nav() + '<main>' + body + '</main>' + footer();
  if (id) { const n = document.getElementById(id); if (n) n.focus(); }
  else if (f) { const n = app.querySelector('[data-f="' + f + '"],[data-e="' + f + '"]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } }
}
document.addEventListener('click', async ev => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, d = el.dataset, p = S.view === 'product' ? findBook(S.viewId) : null;
  if (a === 'level') { S.level = d.v; render(); }
  else if (a === 'variant' && p) { S.sel[p.id] = d.id; S.qty[p.id] = 1; render(); }
  else if (a === 'gal' && p) { S.gal[p.id] = Number(d.i); render(); }
  else if (a === 'qinc' && p) { const v = selVariant(p); let q = (S.qty[p.id] || 1) + 1; if (v && v.stock != null) q = Math.min(q, v.stock); S.qty[p.id] = q; render(); }
  else if (a === 'qdec' && p) { S.qty[p.id] = Math.max(1, (S.qty[p.id] || 1) - 1); render(); }
  else if (a === 'add' && p) {
    const v = selVariant(p); if (!v || !priced(v) || !avail(v)) return;
    let want = (S.cart[v.id] || 0) + (S.qty[p.id] || 1); if (v.stock != null) want = Math.min(want, v.stock);
    S.cart[v.id] = want; saveCart(); S.qty[p.id] = 1; render(); toast('Added to your order. Open "Your order" at the top to check out.');
  }
  else if (a === 'cinc') { const l = cartLines().find(x => x.k === d.k); if (l && (l.v.stock == null || l.qty < l.v.stock)) { S.cart[d.k] = l.qty + 1; saveCart(); render(); } }
  else if (a === 'cdec') { const n = (S.cart[d.k] || 0) - 1; if (n <= 0) delete S.cart[d.k]; else S.cart[d.k] = n; saveCart(); render(); }
  else if (a === 'send') { sendOrder(); }
  else if (a === 'again') { S.sent = null; render(); }
  else if (a === 'copyorder' && S.sent) { try { await navigator.clipboard.writeText(orderText(S.sent)); toast('Order details copied.'); } catch (e) { toast('Select the text above and copy it.'); } }
  else if (a === 'login') {
    S.busy = true; S.msg = ''; render();
    const { error } = await sb.auth.signInWithPassword({ email: S.login.email.trim(), password: S.login.password });
    S.busy = false;
    if (error) { S.msg = 'Wrong email or password.'; return render(); }
    S.login.password = ''; await checkAdmin(); if (S.isAdmin) { await loadBooks(); await loadOrders(); } render();
  }
  else if (a === 'logout') { await sb.auth.signOut(); S.session = null; S.isAdmin = false; S.orders = []; S.editing = null; await loadBooks(); render(); }
  else if (a === 'adm-tab') { S.adminTab = d.v; S.msg = ''; if (d.v === 'orders') await loadOrders(); render(); }
  else if (a === 'adm-edit') { const b = findBook(d.id); if (b) { await discardNewUploads(); S.editing = toEditing(b); S.confirmDel = false; S.msg = ''; render(); } }
  else if (a === 'adm-new') { await discardNewUploads(); S.editing = newBook(); S.confirmDel = false; S.msg = ''; render(); }
  else if (a === 'adm-cancel') { await discardNewUploads(); S.editing = null; S.confirmDel = false; S.msg = ''; render(); }
  else if (a === 'adm-save') { saveBook(); }
  else if (a === 'adm-del') { S.confirmDel = true; render(); }
  else if (a === 'adm-del-yes' && S.editing) {
    const e = S.editing, paths = e.images.map(i => i.path).filter(isLocal);
    const { error } = await sb.from('books').delete().eq('id', e.id);
    if (error) { toast('Could not delete.'); return; }
    if (paths.length) await sb.storage.from('book-images').remove(paths);
    S.editing = null; S.confirmDel = false; await loadBooks(); render(); toast('Book deleted.');
  }
  else if (a === 'adm-addvar' && S.editing) { S.editing.variants.push({ id: crypto.randomUUID(), isNew: true, name: '', price: null, stock: null }); render(); }
  else if (a === 'adm-rmvar' && S.editing) { const v = S.editing.variants.splice(Number(d.i), 1)[0]; if (v && !v.isNew) S.editing.removedVariants.push(v.id); render(); }
  else if (a === 'adm-rmimg' && S.editing) { const im = S.editing.images.splice(Number(d.i), 1)[0]; if (im) S.editing.removedImages.push(im); render(); }
  else if (a === 'adm-cover' && S.editing) { const im = S.editing.images.splice(Number(d.i), 1)[0]; S.editing.images.unshift(im); render(); }
  else if (a === 'inv-inc' || a === 'inv-dec') {
    let v; S.books.forEach(b => b.variants.forEach(x => { if (x.id === d.v) v = x; }));
    if (v) setStock(d.v, Math.max(0, (v.stock == null ? 0 : v.stock) + (a === 'inv-inc' ? 1 : -1)));
  }
  else if (a === 'ord') { setOrderStatus(d.o, d.s); }
  else if (a === 'ord-refresh') { await loadOrders(); render(); }
});
document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.dataset.f) S.draft[t.dataset.f] = t.value;
  else if (t.dataset.login) S.login[t.dataset.login] = t.value;
  else if (t.dataset.e && S.editing) S.editing[t.dataset.e] = t.type === 'checkbox' ? t.checked : t.value;
  else if (t.dataset.vf && S.editing) { const v = S.editing.variants[Number(t.dataset.i)]; if (v) { const f = t.dataset.vf; v[f] = f === 'name' ? t.value : (t.value === '' ? null : Number(t.value)); } }
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && ev.target.dataset && ev.target.dataset.login) { const b = document.querySelector('[data-act="login"]'); if (b) b.click(); }
});
document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.dataset.inv) { setStock(t.dataset.inv, t.value === '' ? null : Math.max(0, Math.floor(Number(t.value)))); }
  else if (t.dataset.file === 'img' && t.files && t.files[0] && S.editing) {
    const file = t.files[0]; S.uploading = true; render();
    try {
      const blob = await shrink(file), path = S.editing.id + '/' + crypto.randomUUID() + '.jpg';
      const { error } = await sb.storage.from('book-images').upload(path, blob, { contentType: 'image/jpeg' });
      if (error) throw error;
      S.editing.images.push({ id: null, path }); toast('Photo added. Save the book to keep it.');
    } catch (e) { toast('That photo could not be uploaded.'); }
    S.uploading = false; render();
  }
});
window.addEventListener('focus', async () => { if (S.view !== 'admin' || !S.editing) { await loadBooks(); if (!S.editing) render(); } });

/* ---------- start ---------- */
document.getElementById('provinces').innerHTML = PROVINCES.map(p => '<option value="' + p + '"></option>').join('');
render(); route();
await checkAdmin();
await loadBooks();
if (S.isAdmin) await loadOrders();
route();
sb.auth.onAuthStateChange(() => {});
