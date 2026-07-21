import dotenv from 'dotenv'
import express from 'express'
import multer from 'multer'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const existingPort = process.env.PORT
dotenv.config({ override: true })
if (existingPort) process.env.PORT = existingPort

const app = express()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distPath = path.resolve(__dirname, '..', 'dist')
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
})

const port = Number(process.env.PORT || 4242)
const paypalMode = process.env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox'
const paypalBaseUrl = paypalMode === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com'

const products = {
  org: { name: 'Organizacija', price: 60 },
  'custom-car': { name: 'Custom auto', price: 35 },
  ped: { name: 'Custom ped', price: 30 },
  plates: { name: 'Custom tablice', price: 10 },
  phone: { name: 'Broj mobitela in-game', price: 10 },
  'bump-glide': { name: 'Bump + glide na auto', price: 50 }
}

app.use(express.json())

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

async function sendDiscordOrder({ type, shopOrderId, buyer, items, total, paymentStatus, details, paypalOrderId, paypalDetails, western, proofFile }) {
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

app.post('/api/paypal/create-order', async (req, res, next) => {
  try {
    const buyer = normalizeBuyer(req.body.buyer)
    const { items, total } = requireCheckoutData(req.body.cart, buyer)
    const shopOrderId = generateShopOrderId()
    const order = await createPaypalOrder({
      items,
      total,
      shopOrderId,
      origin: req.headers.origin || process.env.PUBLIC_SITE_URL || 'http://localhost:5173'
    })
    const approvalLink = order.links?.find((link) => link.rel === 'approve')?.href
    res.json({ orderId: order.id, shopOrderId, approvalLink, total, items })
  } catch (error) {
    next(error)
  }
})

app.post('/api/paypal/capture-order', async (req, res, next) => {
  try {
    const buyer = normalizeBuyer(req.body.buyer)
    const { items, total } = requireCheckoutData(req.body.cart, buyer)
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
    const discord = await sendDiscordOrder({ type: 'paypal', shopOrderId, buyer, items, total, paymentStatus, details, paypalOrderId, paypalDetails })
    res.json({ ok: true, shopOrderId, captureStatus: capture.status, discord })
  } catch (error) {
    next(error)
  }
})

app.post('/api/western-union/order', upload.single('proof'), async (req, res, next) => {
  try {
    const buyer = normalizeBuyer(JSON.parse(req.body.buyer || '{}'))
    const cart = JSON.parse(req.body.cart || '[]')
    const { items, total } = requireCheckoutData(cart, buyer)
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

    const discord = await sendDiscordOrder({
      type: 'western',
      shopOrderId,
      buyer,
      items,
      total,
      paymentStatus: 'CEKA PROVJERU - Western Union',
      details,
      western,
      proofFile: req.file
    })

    res.json({ ok: true, shopOrderId, discord })
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

app.listen(port, () => {
  console.log(`Echo City checkout API radi na http://localhost:${port}`)
})
