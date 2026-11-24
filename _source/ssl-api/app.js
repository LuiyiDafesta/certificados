const express = require('express');
const cors = require('cors');
const acme = require('acme-client');
const { Resolver } = require('dns').promises;

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration - allow production origins as well as local dev on localhost/127.0.0.1
const ALLOWED_ORIGIN_REGEX = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const ALLOWED_ORIGINS = [
    'https://lsnetinformatica.com.ar',
    'https://www.lsnetinformatica.com.ar'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGIN_REGEX.test(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS blocked origin: ${origin}`));
    },
    methods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// ACME Directory URLs
const STAGING_DIRECTORY = acme.directory.letsencrypt.staging;
const PRODUCTION_DIRECTORY = acme.directory.letsencrypt.production;

const DIRECTORY_URL = process.env.ACME_PRODUCTION === 'true'
    ? PRODUCTION_DIRECTORY
    : STAGING_DIRECTORY;

console.log(`Using ACME directory: ${DIRECTORY_URL === PRODUCTION_DIRECTORY ? 'PRODUCTION' : 'STAGING'}`);

// Helper function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to verify DNS propagation using public resolvers (1.1.1.1, 8.8.8.8)
async function verifyDNSPropagation(domain, expectedValue, maxAttempts = 3) {
    const cleanDomain = domain.replace(/^\*\./, '');
    const hostname = `_acme-challenge.${cleanDomain}`;
    const resolver = new Resolver();
    // Query Google and Cloudflare public DNS for authoritative global propagation check
    resolver.setServers(['1.1.1.1', '8.8.8.8']);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            console.log(`DNS verification attempt ${attempt}/${maxAttempts} for ${hostname}`);
            const records = await resolver.resolveTxt(hostname);
            const flatRecords = records.flat();

            if (flatRecords.includes(expectedValue)) {
                console.log(`DNS verified for ${hostname}`);
                return { success: true, hostname };
            }
            console.log(`DNS records found for ${hostname} but value not matching yet. Found: ${flatRecords.join(', ')}`);
        } catch (err) {
            console.log(`DNS lookup for ${hostname} attempt ${attempt}: ${err.message}`);
        }

        if (attempt < maxAttempts) {
            await wait(2500);
        }
    }
    return { success: false, hostname };
}

/**
 * Step 1: Generate DNS Challenge
 */
app.post('/generate-challenge', async (req, res) => {
    try {
        const { email, domains, certificateType } = req.body;

        if (!email || !domains || domains.length === 0) {
            return res.status(400).json({
                error: 'Email and at least one domain are required'
            });
        }

        const validDomains = domains.map(d => d.trim()).filter(d => d.length > 0);

        if (validDomains.length === 0) {
            return res.status(400).json({
                error: 'At least one valid domain is required'
            });
        }

        console.log(`\n=== NEW CHALLENGE REQUEST ===`);
        console.log(`Domains requested: ${validDomains.join(', ')}`);

        // Create ACME client with new account key
        const accountKey = await acme.crypto.createPrivateKey();

        const client = new acme.Client({
            directoryUrl: DIRECTORY_URL,
            accountKey: accountKey
        });

        // Create account
        await client.createAccount({
            termsOfServiceAgreed: true,
            contact: [`mailto:${email}`]
        });

        const accountUrl = client.getAccountUrl();
        console.log(`ACME account created: ${accountUrl}`);

        // Generate domain private key NOW (we'll need it later for CSR)
        const domainKey = await acme.crypto.createPrivateKey();

        // Create order in ACME RFC 8555:
        // Wildcard domains MUST retain '*.domain.com' in the order identifier!
        const identifiers = validDomains.map(domain => ({
            type: 'dns',
            value: domain
        }));

        // Remove exact duplicate identifiers
        const uniqueIdentifiers = identifiers.filter((id, index, self) =>
            index === self.findIndex(t => t.value === id.value)
        );

        const order = await client.createOrder({ identifiers: uniqueIdentifiers });
        console.log('Order created with URL:', order.url);

        // Get authorizations and DNS challenges
        const authorizations = await client.getAuthorizations(order);
        const dnsRecords = [];
        const challengeInfo = [];

        for (const authz of authorizations) {
            const challenge = authz.challenges.find(c => c.type === 'dns-01');

            if (challenge) {
                const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);
                const recordHost = `_acme-challenge.${authz.identifier.value}`;

                dnsRecords.push({
                    name: recordHost,
                    value: keyAuthorization,
                    domain: authz.identifier.value,
                    wildcard: !!authz.wildcard
                });

                challengeInfo.push({
                    domain: authz.identifier.value,
                    challengeUrl: challenge.url,
                    token: challenge.token,
                    keyAuthorization: keyAuthorization,
                    wildcard: !!authz.wildcard
                });
            }
        }

        // Store everything needed for certificate generation as PEM strings
        const orderData = {
            accountKeyPem: accountKey.toString(),
            accountUrl: accountUrl,
            domainKeyPem: domainKey.toString(),
            orderUrl: order.url,
            domains: validDomains,
            email: email,
            challengeInfo: challengeInfo,
            directoryUrl: DIRECTORY_URL
        };

        // Encode order data
        const orderDataEncoded = Buffer.from(JSON.stringify(orderData)).toString('base64');

        console.log(`Challenge generated successfully`);
        console.log(`DNS Records to configure: ${dnsRecords.length}`);

        res.json({
            dnsRecords: dnsRecords,
            orderData: orderDataEncoded
        });

    } catch (error) {
        console.error('Error generating challenge:', error);
        res.status(500).json({
            error: 'Error generating DNS challenge',
            message: error.message
        });
    }
});

/**
 * Step 2: Get Certificate with safe validation
 */
app.post('/get-certificate', async (req, res) => {
    try {
        const { orderData } = req.body;

        if (!orderData) {
            return res.status(400).json({ error: 'Order data is required' });
        }

        // Decode order data
        let orderInfo;
        try {
            orderInfo = JSON.parse(Buffer.from(orderData, 'base64').toString('utf8'));
        } catch (e) {
            return res.status(400).json({ error: 'Invalid order data' });
        }

        console.log(`\n=== CERTIFICATE REQUEST ===`);
        console.log(`Domains: ${orderInfo.domains.join(', ')}`);
        console.log(`Order URL: ${orderInfo.orderUrl}`);
        console.log(`Directory URL: ${orderInfo.directoryUrl}`);

        const accountKeyBuf = Buffer.from(orderInfo.accountKeyPem);

        const client = new acme.Client({
            directoryUrl: orderInfo.directoryUrl,
            accountKey: accountKeyBuf,
            accountUrl: orderInfo.accountUrl || null
        });

        // Ensure ACME account connection
        if (!orderInfo.accountUrl) {
            console.log('Re-associating ACME account (legacy request without accountUrl)...');
            try {
                await client.createAccount({
                    termsOfServiceAgreed: true,
                    contact: [`mailto:${orderInfo.email}`]
                });
                console.log('Account re-associated successfully');
            } catch (accountError) {
                console.error(`Error re-associating account: ${accountError.message}`);
                return res.status(400).json({
                    error: 'Error al reconectar la cuenta ACME. Por favor, genera nuevos registros DNS.',
                    message: accountError.message
                });
            }
        }

        // 1. Verify DNS propagation FIRST before triggering Let's Encrypt validation
        // CRITICAL: Calling completeChallenge before DNS propagates causes Let's Encrypt
        // to immediately mark the authorization and order as INVALID (fatal/non-recoverable).
        console.log('Checking DNS propagation with public resolvers (1.1.1.1, 8.8.8.8)...');
        const pendingHosts = [];
        for (const challenge of (orderInfo.challengeInfo || [])) {
            const check = await verifyDNSPropagation(challenge.domain, challenge.keyAuthorization, 2);
            if (!check.success) {
                pendingHosts.push(check.hostname);
            }
        }

        if (pendingHosts.length > 0) {
            const hostsList = [...new Set(pendingHosts)].join(', ');
            console.log(`DNS propagation pending for: ${hostsList}. Not notifying Let's Encrypt yet.`);
            return res.status(400).json({
                error: `Los registros DNS para ${hostsList} aún no se detectan en Internet (propagación en curso). Por favor espera 1 a 3 minutos y vuelve a presionar "Obtener certificado" sin generar nuevos registros.`,
                message: 'DNS propagation pending'
            });
        }
        console.log('DNS propagation verified successfully in public DNS!');

        // 2. Get fresh order status
        console.log(`Fetching order from: ${orderInfo.orderUrl}`);
        let order;
        try {
            order = await client.getOrder({ url: orderInfo.orderUrl });
            console.log(`Order status: ${order.status}`);
        } catch (orderError) {
            console.error(`Error fetching order: ${orderError.message}`);

            // FALLBACK: If order URL failed, recreate order with same keys and domains to leverage cached authorizations
            console.log('Attempting fallback: Recreating order with cached authorizations...');
            try {
                const identifiers = orderInfo.domains.map(domain => ({
                    type: 'dns',
                    value: domain.trim()
                }));

                const uniqueIdentifiers = identifiers.filter((id, index, self) =>
                    index === self.findIndex(t => t.value === id.value)
                );

                order = await client.createOrder({ identifiers: uniqueIdentifiers });
                console.log(`Fallback order status: ${order.status}`);
                orderInfo.orderUrl = order.url;
            } catch (fallbackError) {
                console.error(`Fallback failed: ${fallbackError.message}`);
                return res.status(400).json({
                    error: 'Error al recuperar la orden. Por favor, genera nuevos registros DNS.',
                    message: `${orderError.message} (Fallback: ${fallbackError.message})`
                });
            }
        }

        // If order is already valid, download certificate
        if (order.status === 'valid') {
            console.log('Order already valid, downloading certificate...');
            const certificate = await client.getCertificate(order);
            return sendCertificateResponse(res, certificate, orderInfo.domainKeyPem);
        }

        // If order is invalid, cannot recover
        if (order.status === 'invalid') {
            return res.status(400).json({
                error: 'La orden expiró o fue invalidada por Let\'s Encrypt. Por favor, genera nuevos registros DNS.',
                message: 'Order invalid - please start over'
            });
        }

        // 3. Complete DNS-01 challenges
        const authorizations = await client.getAuthorizations(order);

        for (const authz of authorizations) {
            console.log(`Authorization for ${authz.identifier.value} (wildcard: ${!!authz.wildcard}): ${authz.status}`);

            if (authz.status === 'valid') {
                continue;
            }

            if (authz.status === 'invalid') {
                const chal = authz.challenges.find(c => c.type === 'dns-01');
                const detail = chal?.error?.detail || 'La autorización fue invalidada por Let\'s Encrypt.';
                return res.status(400).json({
                    error: `La validación de ${authz.identifier.value} falló: ${detail}`,
                    message: detail
                });
            }

            const challenge = authz.challenges.find(c => c.type === 'dns-01');

            if (challenge && challenge.status === 'pending') {
                console.log(`Submitting challenge completion to Let's Encrypt for ${authz.identifier.value}...`);
                try {
                    await client.completeChallenge(challenge);
                    console.log(`Challenge submitted for ${authz.identifier.value}`);
                } catch (err) {
                    console.error(`Error completing challenge: ${err.message}`);
                }
            }
        }

        // 4. Wait for validation with retries
        console.log('Waiting for order validation...');

        let validatedOrder;
        let attempts = 0;
        const maxAttempts = 15;

        while (attempts < maxAttempts) {
            attempts++;
            await wait(3000);

            try {
                validatedOrder = await client.getOrder({ url: orderInfo.orderUrl });
                console.log(`Attempt ${attempts}/${maxAttempts}: Order status = ${validatedOrder.status}`);

                if (validatedOrder.status === 'ready' || validatedOrder.status === 'valid') {
                    break;
                }

                if (validatedOrder.status === 'invalid') {
                    let errorDetail = 'Los registros DNS no coincidieron con lo esperado por Let\'s Encrypt.';
                    try {
                        const failedAuths = await client.getAuthorizations(validatedOrder);
                        const failedAuth = failedAuths.find(a => a.status === 'invalid');
                        const failedChal = failedAuth?.challenges.find(c => c.status === 'invalid' || c.error);
                        if (failedChal?.error?.detail) {
                            errorDetail = failedChal.error.detail;
                        }
                    } catch (detailErr) {
                        console.error('Error reading failure details:', detailErr.message);
                    }

                    return res.status(400).json({
                        error: `Validación fallida en Let's Encrypt: ${errorDetail}`,
                        message: errorDetail
                    });
                }
            } catch (err) {
                console.error(`Error checking order: ${err.message}`);
            }
        }

        if (!validatedOrder || (validatedOrder.status !== 'ready' && validatedOrder.status !== 'valid')) {
            return res.status(400).json({
                error: 'La validación tardó demasiado en responder. Verifica los registros DNS y vuelve a intentar.',
                message: 'Validation timeout'
            });
        }

        // 5. Finalize order if ready
        if (validatedOrder.status === 'ready') {
            console.log('Finalizing order...');

            const domainKeyBuffer = Buffer.from(orderInfo.domainKeyPem);
            const commonName = orderInfo.domains.find(d => !d.startsWith('*')) || orderInfo.domains[0];

            const [key, csr] = await acme.crypto.createCsr({
                commonName: commonName,
                altNames: orderInfo.domains
            }, domainKeyBuffer);

            await client.finalizeOrder(validatedOrder, csr);

            // Wait for certificate to be ready
            let finalOrder;
            for (let i = 0; i < 15; i++) {
                await wait(2000);
                finalOrder = await client.getOrder({ url: orderInfo.orderUrl });
                console.log(`Finalization check ${i + 1}: ${finalOrder.status}`);
                if (finalOrder.status === 'valid') break;
            }

            if (!finalOrder || finalOrder.status !== 'valid') {
                return res.status(500).json({
                    error: 'Error al finalizar el certificado en Let\'s Encrypt',
                    message: 'Finalization failed'
                });
            }

            validatedOrder = finalOrder;
        }

        // 6. Download certificate
        console.log('Downloading certificate...');
        const certificate = await client.getCertificate(validatedOrder);

        return sendCertificateResponse(res, certificate, orderInfo.domainKeyPem);

    } catch (error) {
        console.error('Error getting certificate:', error);

        let userMessage = error.message;
        if (error.message.includes('pending')) {
            userMessage = 'Los registros DNS aún no se han propagado. Espera unos minutos más y vuelve a intentar.';
        } else if (error.message.includes('invalid')) {
            userMessage = 'Los registros DNS no son correctos o el challenge expiró. Genera nuevos registros DNS.';
        }

        res.status(500).json({
            error: 'Error generating certificate',
            message: userMessage
        });
    }
});

function sendCertificateResponse(res, certificate, privateKeyPem) {
    // Parse certificate chain
    const certs = certificate.split(/(?=-----BEGIN CERTIFICATE-----)/g).filter(c => c.trim());
    const mainCert = certs[0] || '';
    const caBundle = certs.slice(1).join('\n');

    console.log('Certificate generated successfully!');

    res.json({
        certificate: mainCert.trim(),
        privateKey: privateKeyPem.trim(),
        caBundle: caBundle.trim(),
        fullChain: certificate.trim()
    });
}

// Favicon handler
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Root endpoint: API status & link to web app
app.get('/', (req, res) => {
    res.format({
        'text/html': () => {
            res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SSL Certificate API - LSNet</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #1e293b; padding: 2.5rem; border-radius: 1rem; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); max-width: 480px; width: 90%; text-align: center; border: 1px solid #334155; }
    .status { display: inline-flex; align-items: center; gap: 0.5rem; background: #064e3b; color: #34d399; padding: 0.35rem 0.85rem; border-radius: 9999px; font-weight: 600; font-size: 0.875rem; margin-bottom: 1.25rem; }
    h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
    p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; margin: 0 0 1.5rem; }
    .btn { display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 600; transition: background 0.2s; }
    .btn:hover { background: #1d4ed8; }
    .meta { margin-top: 1.5rem; font-size: 0.8rem; color: #64748b; border-top: 1px solid #334155; padding-top: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="status">● API Online (${DIRECTORY_URL === PRODUCTION_DIRECTORY ? 'Producción' : 'Staging'})</div>
    <h1>SSL Certificate API</h1>
    <p>El backend de generación de certificados Let's Encrypt está funcionando correctamente.</p>
    <a href="https://lsnetinformatica.com.ar/certificados/" class="btn">Abrir Generador de Certificados →</a>
    <div class="meta">Desarrollado por LSNet Informática</div>
  </div>
</body>
</html>`);
        },
        'application/json': () => {
            res.json({
                name: 'SSL Certificate API',
                status: 'online',
                mode: DIRECTORY_URL === PRODUCTION_DIRECTORY ? 'production' : 'staging',
                appUrl: 'https://lsnetinformatica.com.ar/certificados/'
            });
        },
        default: () => {
            res.send('SSL Certificate API is running.');
        }
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        mode: DIRECTORY_URL === PRODUCTION_DIRECTORY ? 'production' : 'staging'
    });
});

const server = app.listen(PORT, () => {
    console.log(`SSL Certificate API running on port ${PORT}`);
    console.log(`Mode: ${DIRECTORY_URL === PRODUCTION_DIRECTORY ? 'PRODUCTION' : 'STAGING'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM signal. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('Received SIGINT signal. Shutting down...');
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
});
