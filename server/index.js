import dotenv from 'dotenv'
import express from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const existingPort = process.env.PORT
dotenv.config({ override: true })
if (existingPort) process.env.PORT = existingPort

const app = express()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distPath = path.resolve(__dirname, '..', 'dist')
const dataPath = path.resolve(__dirname, '..', 'data', 'shop-db.json')
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
})

const port = Number(process.env.PORT || 4242)
const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/i, '').replace(/\/$/, '')
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const paypalMode = process.env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox'
const paypalBaseUrl = paypalMode === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com'

const products = {
  org: { name: 'Organizacija', price: 100 },
  'custom-car': { name: 'Custom auto', price: 100 },
  ped: { name: 'Custom ped', price: 30 },
  plates: { name: 'Custom tablice', price: 10 },
  phone: { name: 'Broj mobitela in-game', price: 10 },
  'bump-glide': { name: 'Bump + glide na auto', price: 50 }
}

const defaultAdmins = [
  ['boko', 'boko124'],
  ['Pavlovic', 'Pavlovic124'],
  ['Makedonac', 'Maki124'],
  ['Bebac', 'Bebac124']
]

app.use(express.json())

function createDefaultCoupons() {
  const codes = [
    ['ECHO10-A7K2', 10], ['ECHO10-M4R9', 10], ['ECHO10-Q8VN', 10], ['ECHO10-Z3LP', 10], ['ECHO10-T6CX', 10],
    ['ECHO20-B2KA', 20], ['ECHO20-H9QW', 20], ['ECHO20-J7MR', 20], ['ECHO20-N4XZ', 20], ['ECHO20-P8LT', 20],
    ['ECHO20-R3VC', 20], ['ECHO20-S6DG', 20], ['ECHO20-U9BF', 20], ['ECHO20-W2HE', 20], ['ECHO20-Y5KN', 20],
    ['ECHO30-C8PA', 30], ['ECHO30-D4QT', 30], ['ECHO30-F7XM', 30], ['ECHO30-G2NV', 30], ['ECHO30-L9RS', 30]
  ]
  return codes.map(([code, percent]) => ({ code, percent, usedBy: null, usedOrderId: null, usedAt: null, active: true }))
}

function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password, storedHash = '') {
  const [salt, hash] = storedHash.split(':')
  if (!salt || !hash) return false
  return passwordHash(password, salt) === storedHash
}

function getAuthSecret() {
  return process.env.AUTH_SECRET || 'echo-city-local-auth-secret-change-later'
}

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url')
}

function signToken(payload) {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = toBase64Url(JSON.stringify({ ...payload, exp: Date.now() + 1000 * 60 * 60 * 24 * 14 }))
  const signature = crypto.createHmac('sha256', getAuthSecret()).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

function readToken(token) {
  const [header, body, signature] = String(token || '').split('.')
  if (!header || !body || !signature) return null
  const expected = crypto.createHmac('sha256', getAuthSecret()).update(`${header}.${body}`).digest('base64url')
  if (signature !== expected) return null
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  if (payload.exp && payload.exp < Date.now()) return null
  return payload
}

async function loadDb() {
  if (supabaseUrl && supabaseSecretKey) {
    const response = await fetch(`${supabaseUrl}/rest/v1/shop_state?id=eq.main&select=data`, {
      headers: {
        apikey: supabaseSecretKey,
        Authorization: `Bearer ${supabaseSecretKey}`
      }
    })

    if (!response.ok) {
      throw new Error('Supabase baza nije dostupna. Provjeri SUPABASE_URL, SUPABASE_SECRET_KEY i shop_state tablicu.')
    }

    const rows = await response.json()
    return rows[0]?.data || { users: [], orders: [], coupons: createDefaultCoupons() }
  }

  try {
    const raw = await fs.readFile(dataPath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return { users: [], orders: [], coupons: createDefaultCoupons() }
  }
}

async function saveDb(db) {
  if (supabaseUrl && supabaseSecretKey) {
    const response = await fetch(`${supabaseUrl}/rest/v1/shop_state`, {
      method: 'POST',
      headers: {
        apikey: supabaseSecretKey,
        Authorization: `Bearer ${supabaseSecretKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        id: 'main',
        data: db,
        updated_at: new Date().toISOString()
      })
    })

    if (!response.ok) {
      throw new Error('Supabase spremanje nije uspjelo.')
    }
    return
  }

  await fs.mkdir(path.dirname(dataPath), { recursive: true })
  await fs.writeFile(dataPath, JSON.stringify(db, null, 2))
}

async function seedAdminUsers() {
  const db = await loadDb()
  let changed = false
  for (const [username, password] of defaultAdmins) {
    const exists = db.users.some((user) => user.username.toLowerCase() === username.toLowerCase())
    if (!exists) {
      db.users.push({
        id: crypto.randomUUID(),
        username,
        passwordHash: passwordHash(password),
        role: 'admin',
        discord: username,
        ingame: username,
        createdAt: new Date().toISOString()
      })
      changed = true
    }
  }
  if (!Array.isArray(db.coupons) || !db.coupons.length) {
    db.coupons = createDefaultCoupons()
    changed = true
  }
  if (changed) await saveDb(db)
}

function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    discord: user.discord || '',
    ingame: user.ingame || ''
  }
}

async function getUserFromRequest(req) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  const payload = readToken(token)
  if (!payload?.id) return null
  const db = await loadDb()
  return db.users.find((user) => user.id === payload.id) || null
}

function requireUser(req, res, next) {
  getUserFromRequest(req)
    .then((user) => {
      if (!user) return res.status(401).json({ error: 'Trebas se prijaviti.' })
      req.user = user
      next()
    })
    .catch(next)
}

function requireAdmin(req, res, next) {
  requireUser(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Nemas admin pristup.' })
    next()
  })
}

function parseCart(rawCart) {
  const cart = Array.isArray(rawCart) ? rawCart : []
  return cart
    .map((item) => {
      const product = products[item.id]
      const quantity = Math.max(0, Number(item.quantity || 0))
      if (!product || !quantity) return null
      return {
        id: item.id,
        name: product.name,
        quantity,
        price: product.price,
        total: product.price * quantity
      }
    })
    .filter(Boolean)
}

function calculateTotal(items) {
  return Number(items.reduce((sum, item) => sum + item.total, 0).toFixed(2))
}

function calculateDiscount(total, coupon) {
  if (!coupon?.active || coupon.usedAt) return { code: '', percent: 0, amount: 0, total }
  const amount = Number((total * (coupon.percent / 100)).toFixed(2))
  return {
    code: coupon.code,
    percent: coupon.percent,
    amount,
    total: Number(Math.max(0.01, total - amount).toFixed(2))
  }
}

async function getCheckoutSummary(cart, buyer, discountCode = '') {
  const { items, total } = requireCheckoutData(cart, buyer)
  const db = await loadDb()
  const coupon = db.coupons.find((item) => item.code.toLowerCase() === String(discountCode).trim().toLowerCase())
  if (discountCode && (!coupon || !coupon.active || coupon.usedAt)) {
    const error = new Error('Popust kod nije ispravan ili je vec iskoristen.')
    error.status = 400
    throw error
  }
  const discount = calculateDiscount(total, coupon)
  return { db, items, subtotal: total, discount, total: discount.total }
}

async function saveOrder({ user, shopOrderId, type, buyer, items, subtotal, discount, total, details, paymentStatus, paypalOrderId, paypalDetails, western }) {
  const db = await loadDb()
  const now = new Date().toISOString()
  const order = {
    id: shopOrderId,
    userId: user?.id || null,
    username: user?.username || buyer.discord || 'guest',
    type,
    buyer,
    items,
    subtotal,
    discount,
    total,
    details,
    paymentStatus,
    paypalOrderId: paypalOrderId || '',
    paypalDetails: paypalDetails || null,
    western: western || null,
    createdAt: now
  }

  if (discount?.code) {
    const coupon = db.coupons.find((item) => item.code === discount.code)
    if (coupon && !coupon.usedAt) {
      coupon.usedBy = user?.id || buyer.discord
      coupon.usedOrderId = shopOrderId
      coupon.usedAt = now
    }
  }

  db.orders.unshift(order)
  await saveDb(db)
  return order
}

function normalizeBuyer(rawBuyer = {}) {
  return {
    discord: String(rawBuyer.discord || '').trim(),
    ingame: String(rawBuyer.ingame || '').trim(),
    note: String(rawBuyer.note || '').trim()
  }
}

function requireCheckoutData(cart, buyer) {
  const items = parseCart(cart)
  const total = calculateTotal(items)

  if (!items.length) {
    const error = new Error('Kosarica je prazna.')
    error.status = 400
    throw error
  }

  if (!buyer.discord || !buyer.ingame) {
    const error = new Error('Discord ime i in-game ime su obavezni.')
    error.status = 400
    throw error
  }

  return { items, total }
}

function generateShopOrderId() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `EC-${stamp}-${suffix}`
}

function normalizeDetails(rawDetails = {}, items = []) {
  const productIds = new Set(items.map((item) => item.id))
  return Object.entries(rawDetails || {}).reduce((result, [productId, fields]) => {
    if (!productIds.has(productId) || !fields || typeof fields !== 'object') return result
    result[productId] = Object.entries(fields).reduce((fieldResult, [fieldId, value]) => {
      const cleanValue = String(value || '').trim().slice(0, 500)
      if (cleanValue) fieldResult[fieldId] = cleanValue
      return fieldResult
    }, {})
    return result
  }, {})
}

function formatDetails(details, items) {
  const labels = {
    orgName: 'Naziv organizacije',
    leaderDiscord: 'Vodja organizacije',
    startLocation: 'Start lokacija',
    vehicleName: 'Auto',
    modelLink: 'Link modela',
    pedName: 'Ped',
    pedLink: 'Link peda',
    plateText: 'Tablica',
    phoneNumber: 'Broj mobitela',
    handlingNote: 'Handling zelja'
  }

  const lines = items.flatMap((item) => {
    const fields = details[item.id] || {}
    const fieldLines = Object.entries(fields).map(([key, value]) => `- ${labels[key] || key}: ${value}`)
    return fieldLines.length ? [`${item.name}:`, ...fieldLines] : []
  })

  return lines.join('\n')
}

async function getPaypalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    const error = new Error('PayPal API podaci nisu postavljeni u .env datoteci.')
    error.status = 500
    throw error
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const response = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  })

  if (!response.ok) {
    throw new Error('PayPal autentikacija nije uspjela.')
  }

  const data = await response.json()
  return data.access_token
}

async function createPaypalOrder({ items, total, origin, shopOrderId }) {
  const accessToken = await getPaypalAccessToken()
  const returnUrl = `${origin}/?paypal=success`
  const cancelUrl = `${origin}/?paypal=cancel`

  const response = await fetch(`${paypalBaseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        description: `Echo City Roleplay ${shopOrderId}: ${items.map((item) => `${item.quantity}x ${item.name}`).join(', ')}`,
        amount: {
          currency_code: 'EUR',
          value: total.toFixed(2)
        }
      }],
      application_context: {
        brand_name: 'Echo City Roleplay',
        landing_page: 'LOGIN',
        user_action: 'PAY_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl
      }
    })
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.message || 'PayPal narudzba nije kreirana.')
  }

  return data
}

async function capturePaypalOrder(orderId) {
  const accessToken = await getPaypalAccessToken()
  const response = await fetch(`${paypalBaseUrl}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.message || 'PayPal uplata nije potvrdjena.')
  }

  return data
}

function getPaypalCaptureDetails(capture) {
  const purchaseUnit = capture?.purchase_units?.[0]
  const paymentCapture = purchaseUnit?.payments?.captures?.[0]

  return {
    orderStatus: capture?.status || '',
    orderId: capture?.id || '',
    captureId: paymentCapture?.id || '',
    captureStatus: paymentCapture?.status || '',
    captureAmount: paymentCapture?.amount
      ? `${paymentCapture.amount.value} ${paymentCapture.amount.currency_code}`
      : '',
    payerEmail: capture?.payer?.email_address || '',
    payerName: [capture?.payer?.name?.given_name, capture?.payer?.name?.surname].filter(Boolean).join(' '),
    paidAt: paymentCapture?.create_time || capture?.update_time || ''
  }
}

async function sendDiscordOrder({ type, shopOrderId, buyer, items, subtotal, discount, total, paymentStatus, details, paypalOrderId, paypalDetails, western, proofFile }) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL
  if (!webhookUrl) {
    return { sent: false, reason: 'DISCORD_WEBHOOK_URL nije postavljen.' }
  }

  const itemList = items.map((item) => `- ${item.quantity}x ${item.name} - ${item.total.toFixed(2)} EUR`).join('\n')
  const detailList = formatDetails(details || {}, items)
  const fields = [
    { name: 'Shop Order ID', value: shopOrderId || 'N/A', inline: true },
    { name: 'Kupac', value: `Discord: ${buyer.discord}\nIn-game: ${buyer.ingame}`, inline: false },
    { name: 'Paketi', value: itemList, inline: false },
    { name: 'Ukupno', value: `${total.toFixed(2)} EUR`, inline: true },
    { name: 'Status', value: paymentStatus, inline: true }
  ]

  if (discount?.code) fields.push({ name: 'Popust', value: `${discount.code} - ${discount.percent}% (-${discount.amount.toFixed(2)} EUR)\nPrije popusta: ${subtotal.toFixed(2)} EUR`, inline: false })
  if (buyer.note) fields.push({ name: 'Napomena', value: buyer.note, inline: false })
  if (detailList) fields.push({ name: 'Detalji za aktivaciju', value: detailList.slice(0, 1024), inline: false })
  if (paypalOrderId || paypalDetails) {
    fields.push({
      name: 'PayPal provjera',
      value: [
        'Uplata je potvrdjena preko PayPal API-ja',
        paypalOrderId && `Order ID: ${paypalOrderId}`,
        paypalDetails?.captureId && `Capture ID: ${paypalDetails.captureId}`,
        paypalDetails?.orderStatus && `Order status: ${paypalDetails.orderStatus}`,
        paypalDetails?.captureStatus && `Capture status: ${paypalDetails.captureStatus}`,
        paypalDetails?.captureAmount && `PayPal iznos: ${paypalDetails.captureAmount}`,
        paypalDetails?.payerEmail && `PayPal email kupca: ${paypalDetails.payerEmail}`,
        paypalDetails?.payerName && `PayPal ime kupca: ${paypalDetails.payerName}`,
        paypalDetails?.paidAt && `Vrijeme placanja: ${paypalDetails.paidAt}`
      ].filter(Boolean).join('\n'),
      inline: false
    })
  }
  if (western?.mtcn || western?.senderName) {
    fields.push({
      name: 'Western Union',
      value: [
        western.senderName && `Posiljatelj: ${western.senderName}`,
        western.senderCountry && `Drzava: ${western.senderCountry}`,
        western.mtcn && `MTCN: ${western.mtcn}`
      ].filter(Boolean).join('\n'),
      inline: false
    })
  }
  fields.push({
    name: 'Staff checklist',
    value: '- Provjeri PayPal/WU podatke\n- Provjeri detalje aktivacije\n- Aktiviraj paket\n- Javi kupcu na Discord',
    inline: false
  })

  const payload = {
    username: 'Echo City Checkout',
    embeds: [{
      title: type === 'paypal' ? 'Nova PayPal narudzba' : 'Nova Western Union narudzba',
      color: type === 'paypal' ? 0x22c55e : 0xf97316,
      fields,
      timestamp: new Date().toISOString(),
      footer: { text: 'Echo City Roleplay shop' }
    }]
  }

  if (proofFile) {
    const form = new FormData()
    form.append('payload_json', JSON.stringify(payload))
    form.append('files[0]', new Blob([proofFile.buffer], { type: proofFile.mimetype }), proofFile.originalname)
    const response = await fetch(webhookUrl, { method: 'POST', body: form })
    return { sent: response.ok }
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  return { sent: response.ok }
}

app.get('/api/config', async (req, res) => {
  const paypalConfigured = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET)
  let paypalReady = false

  if (paypalConfigured) {
    try {
      await getPaypalAccessToken()
      paypalReady = true
    } catch {
      paypalReady = false
    }
  }

  res.json({
    paypalMode,
    paypalConfigured,
    paypalReady,
    discordReady: Boolean(process.env.DISCORD_WEBHOOK_URL),
    western: {
      receiver: process.env.WESTERN_UNION_RECEIVER || 'TVOJE IME I PREZIME',
      country: process.env.WESTERN_UNION_COUNTRY || 'Hrvatska'
    }
  })
})

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim()
    const password = String(req.body.password || '')
    const discord = String(req.body.discord || '').trim()
    const ingame = String(req.body.ingame || '').trim()
    if (username.length < 3 || password.length < 6) {
      return res.status(400).json({ error: 'Username treba imati 3+ znaka, lozinka 6+ znakova.' })
    }
    const db = await loadDb()
    if (db.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
      return res.status(400).json({ error: 'Taj username vec postoji.' })
    }
    const user = {
      id: crypto.randomUUID(),
      username,
      passwordHash: passwordHash(password),
      role: 'user',
      discord,
      ingame,
      createdAt: new Date().toISOString()
    }
    db.users.push(user)
    await saveDb(db)
    res.json({ token: signToken({ id: user.id, role: user.role }), user: publicUser(user) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim()
    const password = String(req.body.password || '')
    const db = await loadDb()
    const user = db.users.find((item) => item.username.toLowerCase() === username.toLowerCase())
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Krivi username ili lozinka.' })
    }
    res.json({ token: signToken({ id: user.id, role: user.role }), user: publicUser(user) })
  } catch (error) {
    next(error)
  }
})

app.get('/api/auth/me', requireUser, (req, res) => {
  res.json({ user: publicUser(req.user) })
})

app.post('/api/discount/preview', async (req, res, next) => {
  try {
    const buyer = normalizeBuyer({
      ...req.body.buyer,
      discord: req.body.buyer?.discord || 'preview',
      ingame: req.body.buyer?.ingame || 'preview'
    })
    const { items, subtotal, discount, total } = await getCheckoutSummary(req.body.cart, buyer, req.body.discountCode)
    res.json({ items, subtotal, discount, total })
  } catch (error) {
    next(error)
  }
})

app.get('/api/orders', requireUser, async (req, res, next) => {
  try {
    const db = await loadDb()
    const orders = db.orders.filter((order) => order.userId === req.user.id)
    const spent = Number(orders.reduce((sum, order) => sum + Number(order.total || 0), 0).toFixed(2))
    res.json({ orders, spent })
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/summary', requireAdmin, async (req, res, next) => {
  try {
    const db = await loadDb()
    const users = db.users.map((user) => {
      const orders = db.orders.filter((order) => order.userId === user.id)
      const spent = Number(orders.reduce((sum, order) => sum + Number(order.total || 0), 0).toFixed(2))
      return { ...publicUser(user), spent, orders: orders.length, createdAt: user.createdAt }
    })
    const revenue = Number(db.orders.reduce((sum, order) => sum + Number(order.total || 0), 0).toFixed(2))
    res.json({ users, orders: db.orders, coupons: db.coupons, revenue })
  } catch (error) {
    next(error)
  }
})

app.post('/api/paypal/create-order', async (req, res, next) => {
  try {
    const user = await getUserFromRequest(req)
    const buyer = normalizeBuyer(req.body.buyer)
    const { items, subtotal, discount, total } = await getCheckoutSummary(req.body.cart, buyer, req.body.discountCode)
    const shopOrderId = generateShopOrderId()
    const order = await createPaypalOrder({
      items,
      total,
      shopOrderId,
      origin: req.headers.origin || process.env.PUBLIC_SITE_URL || 'http://localhost:5173'
    })
    const approvalLink = order.links?.find((link) => link.rel === 'approve')?.href
    res.json({ orderId: order.id, shopOrderId, approvalLink, subtotal, discount, total, items, user: publicUser(user) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/paypal/capture-order', async (req, res, next) => {
  try {
    const user = await getUserFromRequest(req)
    const buyer = normalizeBuyer(req.body.buyer)
    const { items, subtotal, discount, total } = await getCheckoutSummary(req.body.cart, buyer, req.body.discountCode)
    const details = normalizeDetails(req.body.details, items)
    const shopOrderId = String(req.body.shopOrderId || generateShopOrderId())
    const paypalOrderId = String(req.body.orderId || '')
    if (!paypalOrderId) {
      const error = new Error('Nedostaje PayPal order ID.')
      error.status = 400
      throw error
    }

    const capture = await capturePaypalOrder(paypalOrderId)
    const paypalDetails = getPaypalCaptureDetails(capture)
    const paymentStatus = capture.status === 'COMPLETED' ? 'PLACENO - PayPal automatski' : `PayPal status: ${capture.status}`
    const savedOrder = await saveOrder({ user, shopOrderId, type: 'paypal', buyer, items, subtotal, discount, total, details, paymentStatus, paypalOrderId, paypalDetails })
    const discord = await sendDiscordOrder({ type: 'paypal', shopOrderId, buyer, items, subtotal, discount, total, paymentStatus, details, paypalOrderId, paypalDetails })
    res.json({ ok: true, shopOrderId, captureStatus: capture.status, discord, order: savedOrder })
  } catch (error) {
    next(error)
  }
})

app.post('/api/western-union/order', upload.single('proof'), async (req, res, next) => {
  try {
    const user = await getUserFromRequest(req)
    const buyer = normalizeBuyer(JSON.parse(req.body.buyer || '{}'))
    const cart = JSON.parse(req.body.cart || '[]')
    const { items, subtotal, discount, total } = await getCheckoutSummary(cart, buyer, req.body.discountCode)
    const details = normalizeDetails(JSON.parse(req.body.details || '{}'), items)
    const shopOrderId = generateShopOrderId()
    const western = {
      senderName: String(req.body.senderName || '').trim(),
      senderCountry: String(req.body.senderCountry || '').trim(),
      mtcn: String(req.body.mtcn || '').trim()
    }

    if (!western.senderName || !western.mtcn || !req.file) {
      const error = new Error('Za Western Union treba unijeti posiljatelja, MTCN i dokaz uplate.')
      error.status = 400
      throw error
    }

    const paymentStatus = 'CEKA PROVJERU - Western Union'
    const savedOrder = await saveOrder({ user, shopOrderId, type: 'western', buyer, items, subtotal, discount, total, details, paymentStatus, western })
    const discord = await sendDiscordOrder({
      type: 'western',
      shopOrderId,
      buyer,
      items,
      subtotal,
      discount,
      total,
      paymentStatus,
      details,
      western,
      proofFile: req.file
    })

    res.json({ ok: true, shopOrderId, discord, order: savedOrder })
  } catch (error) {
    next(error)
  }
})

app.use(express.static(distPath))

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.use((error, req, res, next) => {
  res.status(error.status || 500).json({ error: error.message || 'Doslo je do greske.' })
})

await seedAdminUsers()

app.listen(port, () => {
  console.log(`Echo City checkout API radi na http://localhost:${port}`)
})
