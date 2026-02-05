const express = require('express');
const cors = require('cors');
const acme = require('acme-client');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration - update with your frontend domain
const ALLOWED_ORIGINS = [
    'https://lsnetinformatica.com.ar',
    'https://www.lsnetinformatica.com.ar',
    'http://localhost:5173',
    'http://localhost:3000'
];

app.use(cors({
    origin: ALLOWED_ORIGINS,
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Store pending orders (in production, use Redis or a database)
const pendingOrders = new Map();

// ACME Directory URLs
const STAGING_DIRECTORY = acme.directory.letsencrypt.staging;
const PRODUCTION_DIRECTORY = acme.directory.letsencrypt.production;

// Use staging for testing (change to PRODUCTION_DIRECTORY when ready)
const DIRECTORY_URL = process.env.ACME_PRODUCTION === 'true'
    ? PRODUCTION_DIRECTORY
    : STAGING_DIRECTORY;

console.log(`Using ACME directory: ${DIRECTORY_URL === PRODUCTION_DIRECTORY ? 'PRODUCTION' : 'STAGING'}`);

/**
 * Step 1: Generate DNS Challenge
 * Creates ACME account, order, and returns DNS TXT records to configure
 */
app.post('/generate-challenge', async (req, res) => {
    try {
        const { email, domains, certificateType } = req.body;

        if (!email || !domains || domains.length === 0) {
            return res.status(400).json({
                error: 'Email and at least one domain are required'
            });
        }

        // Filter empty domains
        const validDomains = domains.filter(d => d && d.trim() !== '');

        if (validDomains.length === 0) {
            return res.status(400).json({
                error: 'At least one valid domain is required'
            });
        }

        console.log(`Generating challenge for domains: ${validDomains.join(', ')}`);

        // Create ACME client
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

        console.log('ACME account created');

        // Create order for all domains
        const order = await client.createOrder({
            identifiers: validDomains.map(domain => ({
                type: 'dns',
                value: domain.startsWith('*.') ? domain.substring(2) : domain
            }))
        });

        console.log('Order created');

        // Get authorizations and DNS challenges
        const authorizations = await client.getAuthorizations(order);
        const dnsRecords = [];
        const challengeData = [];

        for (const authz of authorizations) {
            const challenge = authz.challenges.find(c => c.type === 'dns-01');

            if (challenge) {
                const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);

                dnsRecords.push({
                    name: `_acme-challenge.${authz.identifier.value}`,
                    value: keyAuthorization,
                    domain: authz.identifier.value
                });

                challengeData.push({
                    challenge: challenge,
                    authz: authz
                });
            }
        }

        // Generate order ID and store data
        const orderId = Buffer.from(JSON.stringify({
            timestamp: Date.now(),
            email: email
        })).toString('base64').substring(0, 32);

        // Store order data for later retrieval
        pendingOrders.set(orderId, {
            client: client,
            order: order,
            accountKey: accountKey,
            challengeData: challengeData,
            domains: validDomains,
            email: email,
            createdAt: Date.now()
        });

        // Clean up old orders (older than 1 hour)
        const oneHourAgo = Date.now() - 3600000;
        for (const [key, value] of pendingOrders.entries()) {
            if (value.createdAt < oneHourAgo) {
                pendingOrders.delete(key);
            }
        }

        console.log(`Challenge generated with orderId: ${orderId}`);

        res.json({
            dnsRecords: dnsRecords,
            orderData: orderId
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
 * Step 2: Verify DNS and Get Certificate
 * Validates DNS challenges and issues the certificate
 */
app.post('/get-certificate', async (req, res) => {
    try {
        const { orderData } = req.body;

        if (!orderData) {
            return res.status(400).json({
                error: 'Order data is required'
            });
        }

        // Retrieve pending order
        const orderInfo = pendingOrders.get(orderData);

        if (!orderInfo) {
            return res.status(400).json({
                error: 'Order not found or expired. Please start over.'
            });
        }

        const { client, order, challengeData, domains } = orderInfo;

        console.log(`Verifying challenges for domains: ${domains.join(', ')}`);

        // Submit all challenges for validation
        for (const { challenge } of challengeData) {
            await client.completeChallenge(challenge);
        }

        console.log('Challenges submitted, waiting for validation...');

        // Wait for order to be ready
        const validOrder = await client.waitForValidStatus(order);

        console.log('Order validated, generating certificate...');

        // Generate domain private key
        const domainKey = await acme.crypto.createPrivateKey();

        // Create CSR
        const [key, csr] = await acme.crypto.createCsr({
            commonName: domains.find(d => !d.startsWith('*')) || domains[0],
            altNames: domains
        }, domainKey);

        // Finalize order and get certificate
        await client.finalizeOrder(validOrder, csr);
        const certificate = await client.getCertificate(validOrder);

        console.log('Certificate generated successfully');

        // Parse certificate chain
        const certs = certificate.split(/(?=-----BEGIN CERTIFICATE-----)/g).filter(c => c.trim());
        const mainCert = certs[0] || '';
        const caBundle = certs.slice(1).join('\n');

        // Clean up order
        pendingOrders.delete(orderData);

        // Export private key to PEM format
        const privateKeyPem = domainKey.toString();

        res.json({
            certificate: mainCert.trim(),
            privateKey: privateKeyPem.trim(),
            caBundle: caBundle.trim(),
            fullChain: certificate.trim()
        });

    } catch (error) {
        console.error('Error getting certificate:', error);

        // Provide more helpful error messages
        let userMessage = error.message;

        if (error.message.includes('pending')) {
            userMessage = 'Los registros DNS aún no se han propagado. Espera unos minutos más y vuelve a intentar.';
        } else if (error.message.includes('invalid')) {
            userMessage = 'Los registros DNS no son correctos. Verifica que hayas configurado los registros TXT correctamente.';
        }

        res.status(500).json({
            error: 'Error generating certificate',
            message: userMessage
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        mode: DIRECTORY_URL === PRODUCTION_DIRECTORY ? 'production' : 'staging'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`SSL Certificate API running on port ${PORT}`);
    console.log(`Mode: ${DIRECTORY_URL === PRODUCTION_DIRECTORY ? 'PRODUCTION' : 'STAGING'}`);
});
