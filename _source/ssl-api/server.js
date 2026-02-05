const express = require('express');
const cors = require('cors');
const acme = require('acme-client');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
const ALLOWED_ORIGINS = [
    'https://lsnetinformatica.com.ar',
    'https://www.lsnetinformatica.com.ar',
    'http://localhost:5173',
    'http://localhost:3000'
];

app.use(cors({
    origin: ALLOWED_ORIGINS,
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

// Helper function to verify DNS propagation
async function verifyDNSPropagation(domain, expectedValue, maxAttempts = 3) {
    const dns = require('dns').promises;
    const hostname = `_acme-challenge.${domain}`;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            console.log(`DNS verification attempt ${attempt}/${maxAttempts} for ${hostname}`);
            const records = await dns.resolveTxt(hostname);
            const flatRecords = records.flat();

            if (flatRecords.includes(expectedValue)) {
                console.log(`DNS verified for ${hostname}`);
                return true;
            }
            console.log(`DNS records found but value not matching. Found: ${flatRecords.join(', ')}`);
        } catch (err) {
            console.log(`DNS lookup failed for ${hostname}: ${err.message}`);
        }

        if (attempt < maxAttempts) {
            console.log('Waiting 5 seconds before retry...');
            await wait(5000);
        }
    }
    return false;
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

        const validDomains = domains.filter(d => d && d.trim() !== '');

        if (validDomains.length === 0) {
            return res.status(400).json({
                error: 'At least one valid domain is required'
            });
        }

        console.log(`\n=== NEW REQUEST ===`);
        console.log(`Generating challenge for domains: ${validDomains.join(', ')}`);

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

        console.log('ACME account created');

        // Generate domain private key NOW (we'll need it later)
        const domainKey = await acme.crypto.createPrivateKey();

        // Create order
        const identifiers = validDomains.map(domain => ({
            type: 'dns',
            value: domain.replace(/^\*\./, '') // Remove wildcard prefix for identifier
        }));

        // Remove duplicates
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

                dnsRecords.push({
                    name: `_acme-challenge.${authz.identifier.value}`,
                    value: keyAuthorization,
                    domain: authz.identifier.value
                });

                challengeInfo.push({
                    domain: authz.identifier.value,
                    challengeUrl: challenge.url,
                    token: challenge.token,
                    keyAuthorization: keyAuthorization
                });
            }
        }

        // Store everything needed for certificate generation as PEM strings
        const orderData = {
            accountKeyPem: accountKey.toString(),
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
 * Step 2: Get Certificate with retry logic
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

        // Convert PEM string back to key object using Node crypto
        const accountKeyObject = crypto.createPrivateKey(orderInfo.accountKeyPem);

        const client = new acme.Client({
            directoryUrl: orderInfo.directoryUrl,
            accountKey: accountKeyObject
        });

        // Verify DNS propagation first (optional check)
        console.log('Checking DNS propagation...');
        for (const challenge of orderInfo.challengeInfo) {
            const verified = await verifyDNSPropagation(challenge.domain, challenge.keyAuthorization, 2);
            if (verified) {
                console.log(`DNS OK for ${challenge.domain}`);
            } else {
                console.log(`DNS not yet propagated for ${challenge.domain}, will try anyway...`);
            }
        }

        // Get fresh order status
        const order = await client.getOrder(orderInfo.orderUrl);
        console.log(`Order status: ${order.status}`);

        // If order is already valid, just get the certificate
        if (order.status === 'valid') {
            console.log('Order already valid, downloading certificate...');
            const certificate = await client.getCertificate(order);
            return sendCertificateResponse(res, certificate, orderInfo.domainKeyPem);
        }

        // If order is invalid, need to start over
        if (order.status === 'invalid') {
            return res.status(400).json({
                error: 'El orden expiró o fue invalidado. Por favor, genera nuevos registros DNS.',
                message: 'Order invalid - please start over'
            });
        }

        // Get authorizations and complete challenges
        const authorizations = await client.getAuthorizations(order);

        for (const authz of authorizations) {
            console.log(`Authorization for ${authz.identifier.value}: ${authz.status}`);

            if (authz.status === 'valid') {
                continue;
            }

            if (authz.status === 'invalid') {
                return res.status(400).json({
                    error: `La autorización para ${authz.identifier.value} falló. Genera nuevos registros DNS.`,
                    message: 'Authorization invalid'
                });
            }

            const challenge = authz.challenges.find(c => c.type === 'dns-01');

            if (challenge && challenge.status === 'pending') {
                console.log(`Submitting challenge for ${authz.identifier.value}...`);

                try {
                    await client.completeChallenge(challenge);
                    console.log(`Challenge submitted for ${authz.identifier.value}`);
                } catch (err) {
                    console.error(`Error completing challenge: ${err.message}`);
                    // Continue anyway, maybe it will work
                }
            }
        }

        // Wait for validation with retries
        console.log('Waiting for order validation...');

        let validatedOrder;
        let attempts = 0;
        const maxAttempts = 15;

        while (attempts < maxAttempts) {
            attempts++;
            await wait(4000); // Wait 4 seconds between checks

            try {
                validatedOrder = await client.getOrder(orderInfo.orderUrl);
                console.log(`Attempt ${attempts}/${maxAttempts}: Order status = ${validatedOrder.status}`);

                if (validatedOrder.status === 'ready' || validatedOrder.status === 'valid') {
                    break;
                }

                if (validatedOrder.status === 'invalid') {
                    return res.status(400).json({
                        error: 'Los registros DNS no son correctos. Verifica que hayas configurado los registros TXT correctamente.',
                        message: 'Validation failed'
                    });
                }
            } catch (err) {
                console.error(`Error checking order: ${err.message}`);
            }
        }

        if (!validatedOrder || (validatedOrder.status !== 'ready' && validatedOrder.status !== 'valid')) {
            return res.status(400).json({
                error: 'La validación tardó demasiado. Verifica los registros DNS y vuelve a intentar.',
                message: 'Validation timeout'
            });
        }

        // Finalize order if needed
        if (validatedOrder.status === 'ready') {
            console.log('Finalizing order...');

            // Convert domain key PEM back to key object
            const domainKeyObject = crypto.createPrivateKey(orderInfo.domainKeyPem);

            const [key, csr] = await acme.crypto.createCsr({
                commonName: orderInfo.domains.find(d => !d.startsWith('*')) || orderInfo.domains[0],
                altNames: orderInfo.domains
            }, domainKeyObject);

            await client.finalizeOrder(validatedOrder, csr);

            // Wait for certificate
            let finalOrder;
            for (let i = 0; i < 15; i++) {
                await wait(2000);
                finalOrder = await client.getOrder(orderInfo.orderUrl);
                console.log(`Finalization check ${i + 1}: ${finalOrder.status}`);
                if (finalOrder.status === 'valid') break;
            }

            if (!finalOrder || finalOrder.status !== 'valid') {
                return res.status(500).json({
                    error: 'Error al finalizar el certificado',
                    message: 'Finalization failed'
                });
            }

            validatedOrder = finalOrder;
        }

        // Download certificate
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
        } else if (error.message.includes('modulusLength')) {
            userMessage = 'Error interno de criptografía. Por favor, genera nuevos registros DNS.';
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

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        mode: DIRECTORY_URL === PRODUCTION_DIRECTORY ? 'production' : 'staging'
    });
});

app.listen(PORT, () => {
    console.log(`SSL Certificate API running on port ${PORT}`);
    console.log(`Mode: ${DIRECTORY_URL === PRODUCTION_DIRECTORY ? 'PRODUCTION' : 'STAGING'}`);
});
